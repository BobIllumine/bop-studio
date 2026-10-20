import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { encodePath, fetchBytes, type StoredObject } from "../../api/client";
import {
  CHANNEL_FILE,
  decodeDepthExr,
  decodeGray16Png,
  depthRgba,
  indexScenes,
  labelRgba,
  type Channel,
  type SceneFiles,
} from "../../preview/frames";
import { useSettings } from "../../state/settings";
import { Seg, Select } from "../../ui/controls";
import { ChevronLeft, ChevronRight } from "../../ui/icons";

const PAGE = 12;

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "rgb", label: "RGB" },
  { value: "depth", label: "Depth" },
  { value: "instance", label: "Instances" },
];

interface Frame {
  width: number;
  height: number;
  image: ImageBitmap | ImageData;
  metres?: Float32Array;
  labels?: Uint16Array;
}

async function decode(channel: Channel, bytes: ArrayBuffer): Promise<Frame> {
  switch (channel) {
    case "rgb": {
      const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      return { width: image.width, height: image.height, image };
    }
    case "depth": {
      const depth = decodeDepthExr(bytes);
      return { ...depth, image: new ImageData(depthRgba(depth), depth.width, depth.height) };
    }
    case "instance": {
      const labels = await decodeGray16Png(bytes);
      return { ...labels, image: new ImageData(labelRgba(labels), labels.width, labels.height) };
    }
  }
}

function useFrame(job: string, path: string | undefined, channel: Channel) {
  const server = useSettings((s) => s.apiBase);
  return useQuery({
    queryKey: ["frame", server, job, path],
    queryFn: async ({ signal }) => decode(channel, await fetchBytes(`/api/v1/jobs/${job}/files/${encodePath(path!)}`, signal)),
    enabled: Boolean(path),
    staleTime: Infinity,
    gcTime: 60_000,
  });
}

interface Instance {
  instance_id: number;
  asset_id: string;
  bin_id: string;
}

function useSceneInstances(job: string, path: string | undefined) {
  const server = useSettings((s) => s.apiBase);
  return useQuery({
    queryKey: ["scene-json", server, job, path],
    queryFn: async ({ signal }) => {
      const bytes = await fetchBytes(`/api/v1/jobs/${job}/files/${encodePath(path!)}`, signal);
      const scene = JSON.parse(new TextDecoder().decode(bytes)) as { instances: Instance[] };
      return new Map(scene.instances.map((i) => [i.instance_id, i]));
    },
    enabled: Boolean(path),
    staleTime: Infinity,
  });
}

/** One decoded frame drawn to a canvas, reporting the pixel under the pointer. */
function FrameCanvas({
  job,
  path,
  channel,
  onHover,
}: {
  job: string;
  path: string | undefined;
  channel: Channel;
  onHover?: (pixel: { x: number; y: number; frame: Frame } | null) => void;
}) {
  const frame = useFrame(job, path, channel);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const data = frame.data;
    const context = canvas.current?.getContext("2d");
    if (!data || !context) return;
    if (data.image instanceof ImageData) context.putImageData(data.image, 0, 0);
    else context.drawImage(data.image, 0, 0);
  }, [frame.data]);

  if (!path) return <div className="frame-msg">No {CHANNEL_FILE[channel]} stored</div>;
  if (frame.error) return <div className="frame-msg error">{frame.error.message}</div>;
  if (!frame.data) return <div className="frame-msg">Loading…</div>;
  const { width, height } = frame.data;
  return (
    <canvas
      ref={canvas}
      width={width}
      height={height}
      style={{ aspectRatio: `${width} / ${height}`, imageRendering: channel === "rgb" ? "auto" : "pixelated" }}
      onMouseMove={(event) => {
        if (!onHover) return;
        const box = event.currentTarget.getBoundingClientRect();
        const x = Math.min(width - 1, Math.floor(((event.clientX - box.left) / box.width) * width));
        const y = Math.min(height - 1, Math.floor(((event.clientY - box.top) / box.height) * height));
        onHover({ x, y, frame: frame.data });
      }}
      onMouseLeave={() => onHover?.(null)}
    />
  );
}

/** Pages through stored scenes, or shows every camera of one scene. */
export function DatasetPreview({ job, files }: { job: string; files: StoredObject[] }) {
  const scenes = useMemo(() => indexScenes(files.map((f) => f.path)), [files]);
  const cameras = useMemo(() => [...new Set(scenes.flatMap((s) => s.frames.map((f) => f.camera)))].sort((a, b) => a - b), [scenes]);
  const [channel, setChannel] = useState<Channel>("rgb");
  const [camera, setCamera] = useState<number | undefined>();
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  if (scenes.length === 0) {
    return <div className="notice">No rendered scenes stored yet. Scenes appear here as they are committed.</div>;
  }
  const shownCamera = camera !== undefined && cameras.includes(camera) ? camera : cameras[0]!;
  const pages = Math.ceil(scenes.length / PAGE);
  const current = Math.min(page, pages - 1);
  const openIndex = open === null ? -1 : scenes.findIndex((s) => s.scene === open);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start", gap: 10 }}>
        <Seg label="Channel" options={CHANNELS} value={channel} onChange={setChannel} />
        {openIndex < 0 ? (
          <>
            {cameras.length > 1 && (
              <Select
                label="Camera"
                value={String(shownCamera)}
                options={cameras.map((c) => ({ value: String(c), label: `Camera ${c}` }))}
                onChange={(value) => setCamera(Number(value))}
                style={{ width: 120 }}
              />
            )}
            <span className="spacer" />
            <Pager
              label={`${current * PAGE + 1}–${Math.min(scenes.length, (current + 1) * PAGE)} of ${scenes.length} scenes`}
              previous={current > 0 ? () => setPage(current - 1) : undefined}
              next={current < pages - 1 ? () => setPage(current + 1) : undefined}
            />
          </>
        ) : (
          <>
            <button type="button" className="ctl btn" onClick={() => setOpen(null)}>
              <ChevronLeft size={12} />
              All scenes
            </button>
            <span className="spacer" />
            <Pager
              label={`Scene ${scenes[openIndex]!.scene} · ${openIndex + 1} of ${scenes.length}`}
              previous={openIndex > 0 ? () => setOpen(scenes[openIndex - 1]!.scene) : undefined}
              next={openIndex < scenes.length - 1 ? () => setOpen(scenes[openIndex + 1]!.scene) : undefined}
            />
          </>
        )}
      </div>
      {openIndex < 0 ? (
        <div className="frames">
          {scenes.slice(current * PAGE, (current + 1) * PAGE).map((scene) => (
            <button
              key={scene.scene}
              type="button"
              className="tile"
              onClick={() => {
                setOpen(scene.scene);
                setPage(Math.floor(scenes.indexOf(scene) / PAGE));
              }}
            >
              <div className="frame-img">
                <FrameCanvas job={job} path={scene.frames.find((f) => f.camera === shownCamera)?.paths[channel]} channel={channel} />
              </div>
              <span className="tile-body row mono" style={{ flexDirection: "row", fontSize: 12 }}>
                <span>Scene {scene.scene}</span>
                <span className="muted">{scene.frames.length === 1 ? "1 camera" : `${scene.frames.length} cameras`}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <SceneFrames job={job} scene={scenes[openIndex]!} channel={channel} />
      )}
    </div>
  );
}

function Pager({ label, previous, next }: { label: string; previous?: () => void; next?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button type="button" className="ctl ibtn" aria-label="Previous" disabled={!previous} onClick={previous}>
        <ChevronLeft />
      </button>
      <span className="val" style={{ minWidth: 150, textAlign: "center" }}>
        {label}
      </span>
      <button type="button" className="ctl ibtn" aria-label="Next" disabled={!next} onClick={next}>
        <ChevronRight />
      </button>
    </div>
  );
}

/** Every camera of one scene, with what lies under the pointer. */
function SceneFrames({ job, scene, channel }: { job: string; scene: SceneFiles; channel: Channel }) {
  const instances = useSceneInstances(job, scene.metadata);
  const [hover, setHover] = useState<{ camera: number; text: string } | null>(null);

  const describe = (x: number, y: number, frame: Frame) => {
    const i = y * frame.width + x;
    const parts = [`x ${x}, y ${y}`];
    if (frame.metres) parts.push(frame.metres[i]! > 0 ? `depth ${frame.metres[i]!.toFixed(4)} m` : "background");
    if (frame.labels) {
      const id = frame.labels[i]!;
      const instance = instances.data?.get(id);
      parts.push(id === 0 ? "background" : instance ? `instance ${id} · ${instance.asset_id} in ${instance.bin_id}` : `instance ${id}`);
    }
    return parts.join("  ·  ");
  };

  return (
    <div className="frames large">
      {scene.frames.map((frame) => (
        <figure key={frame.camera} className="tile" style={{ margin: 0, cursor: "default" }}>
          <div className="frame-img">
            <FrameCanvas
              job={job}
              path={frame.paths[channel]}
              channel={channel}
              onHover={(pixel) => setHover(pixel && { camera: frame.camera, text: describe(pixel.x, pixel.y, pixel.frame) })}
            />
          </div>
          <figcaption className="tile-body row mono" style={{ flexDirection: "row", fontSize: 12 }}>
            <span>Camera {frame.camera}</span>
            <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {hover?.camera === frame.camera ? hover.text : channel === "rgb" ? "" : "hover for values"}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
