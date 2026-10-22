import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { encodePath, fetchBytes, type StoredObject } from "../../api/client";
import {
  CHANNEL_FILE,
  decodeDepthExr,
  decodeGray16Png,
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

/** Longest edge of a preview in the scene grid and in a scene's own view. */
const GRID_SIZE = 512;
const DETAIL_SIZE = 1024;

/** What a canvas draws. */
interface Picture {
  width: number;
  height: number;
  image: ImageBitmap | ImageData;
}

/** A stored frame's exact values, at its full resolution. */
interface Values {
  width: number;
  height: number;
  metres?: Float32Array;
  labels?: Uint16Array;
  image?: ImageData;
}

async function decodeValues(channel: Channel, bytes: ArrayBuffer): Promise<Values> {
  switch (channel) {
    case "rgb":
      throw new Error("RGB frames have no values");
    case "depth":
      return decodeDepthExr(bytes);
    case "instance": {
      const labels = await decodeGray16Png(bytes);
      return { ...labels, image: new ImageData(labelRgba(labels), labels.width, labels.height) };
    }
  }
}

/** A stored frame file, decoded; large for depth, so loaded only when `enabled`. */
function useValues(job: string, path: string | undefined, channel: Channel, enabled: boolean) {
  const server = useSettings((s) => s.apiBase);
  return useQuery({
    queryKey: ["frame", server, job, path],
    queryFn: async ({ signal }) => decodeValues(channel, await fetchBytes(`/api/v1/jobs/${job}/files/${encodePath(path!)}`, signal)),
    enabled: Boolean(path) && channel !== "rgb" && enabled,
    staleTime: Infinity,
    gcTime: 60_000,
  });
}

/**
 * What to draw for a frame: the server's small coloured preview for RGB and
 * depth, and the stored instance labels, which are smaller than their preview
 * and are what hovering reads anyway.
 */
function usePicture(job: string, path: string | undefined, channel: Channel, size: number) {
  const server = useSettings((s) => s.apiBase);
  const values = useValues(job, path, channel, channel === "instance");
  const preview = useQuery({
    queryKey: ["preview", server, job, path, size],
    queryFn: async ({ signal }): Promise<Picture> => {
      const bytes = await fetchBytes(`/api/v1/jobs/${job}/previews/${encodePath(path!)}?size=${size}`, signal);
      const image = await createImageBitmap(new Blob([bytes]));
      return { width: image.width, height: image.height, image };
    },
    enabled: Boolean(path) && channel !== "instance",
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
  if (channel !== "instance") return preview;
  const image = values.data?.image;
  return { ...values, data: values.data && image ? { width: values.data.width, height: values.data.height, image } : undefined };
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

/** One frame drawn to a canvas, reporting where the pointer is as fractions of its width and height. */
function FrameCanvas({
  job,
  path,
  channel,
  size,
  onHover,
}: {
  job: string;
  path: string | undefined;
  channel: Channel;
  size: number;
  onHover?: (point: { x: number; y: number } | null) => void;
}) {
  const picture = usePicture(job, path, channel, size);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const data = picture.data;
    const context = canvas.current?.getContext("2d");
    if (!data || !context) return;
    if (data.image instanceof ImageData) context.putImageData(data.image, 0, 0);
    else context.drawImage(data.image, 0, 0);
  }, [picture.data]);

  if (!path) return <div className="frame-msg">No {CHANNEL_FILE[channel]} stored</div>;
  if (picture.error) return <div className="frame-msg error">{picture.error.message}</div>;
  if (!picture.data) return <div className="frame-msg">Loading…</div>;
  const { width, height } = picture.data;
  return (
    <canvas
      ref={canvas}
      width={width}
      height={height}
      style={{ aspectRatio: `${width} / ${height}`, imageRendering: channel === "rgb" ? "auto" : "pixelated" }}
      onMouseMove={(event) => {
        if (!onHover) return;
        const box = event.currentTarget.getBoundingClientRect();
        onHover({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height });
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
                <FrameCanvas
                  job={job}
                  path={scene.frames.find((f) => f.camera === shownCamera)?.paths[channel]}
                  channel={channel}
                  size={GRID_SIZE}
                />
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
  return (
    <div className="frames large">
      {scene.frames.map((frame) => (
        <CameraFrame
          key={frame.camera}
          job={job}
          camera={frame.camera}
          path={frame.paths[channel]}
          channel={channel}
          instances={instances.data}
        />
      ))}
    </div>
  );
}

/** One camera's frame; its stored values load the first time the pointer is over it. */
function CameraFrame({
  job,
  camera,
  path,
  channel,
  instances,
}: {
  job: string;
  camera: number;
  path: string | undefined;
  channel: Channel;
  instances: Map<number, Instance> | undefined;
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [wanted, setWanted] = useState(false);
  const values = useValues(job, path, channel, wanted);

  const describe = (frame: Values, point: { x: number; y: number }) => {
    const x = Math.min(frame.width - 1, Math.floor(point.x * frame.width));
    const y = Math.min(frame.height - 1, Math.floor(point.y * frame.height));
    const i = y * frame.width + x;
    const parts = [`x ${x}, y ${y}`];
    if (frame.metres) parts.push(frame.metres[i]! > 0 ? `depth ${frame.metres[i]!.toFixed(4)} m` : "background");
    if (frame.labels) {
      const id = frame.labels[i]!;
      const instance = instances?.get(id);
      parts.push(id === 0 ? "background" : instance ? `instance ${id} · ${instance.asset_id} in ${instance.bin_id}` : `instance ${id}`);
    }
    return parts.join("  ·  ");
  };
  const caption =
    channel === "rgb"
      ? ""
      : !point
        ? "hover for values"
        : values.error
          ? values.error.message
          : values.data
            ? describe(values.data, point)
            : "loading values…";

  return (
    <figure className="tile" style={{ margin: 0, cursor: "default" }}>
      <div className="frame-img">
        <FrameCanvas
          job={job}
          path={path}
          channel={channel}
          size={DETAIL_SIZE}
          onHover={(next) => {
            setPoint(next);
            if (next) setWanted(true);
          }}
        />
      </div>
      <figcaption className="tile-body row mono" style={{ flexDirection: "row", fontSize: 12 }}>
        <span>Camera {camera}</span>
        <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {caption}
        </span>
      </figcaption>
    </figure>
  );
}
