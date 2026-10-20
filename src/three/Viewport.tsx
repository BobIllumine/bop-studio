import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { Vector3, type BufferGeometry, type Camera as ThreeCamera } from "three";

import type { Asset, Camera, Draft, Vec3 } from "../config/types";
import { threeCameraQuaternion } from "../config/pose";
import type { Placed } from "../preview/placement";
import { CameraIcon, MinusIcon, PlusIcon } from "../ui/icons";
import { Parts, Seg } from "../ui/controls";
import {
  type ColorBy,
  Frustum,
  KeyLight,
  RoomLighting,
  SceneContent,
  cameraPose,
  verticalFov,
} from "./SceneContent";

type ViewKind = "iso" | "top" | "front";

interface ViewRequest {
  kind: ViewKind | "in" | "out";
  nonce: number;
}

/** Applies view presets and zoom steps to the orbit camera. */
function ViewController({ request, target, extent }: { request: ViewRequest; target: Vec3; extent: number }) {
  const { camera, controls } = useThree() as unknown as {
    camera: ThreeCamera;
    controls: { target: Vector3; update: () => void } | null;
  };
  useEffect(() => {
    const centre = new Vector3(...target);
    const distance = Math.max(2.2, extent * 3.2);
    const at = (azimuthDeg: number, elevationDeg: number, radius: number) => {
      const az = (azimuthDeg * Math.PI) / 180;
      const el = (elevationDeg * Math.PI) / 180;
      return centre.clone().add(new Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).multiplyScalar(radius));
    };
    const offset = camera.position.clone().sub(controls?.target ?? centre);
    switch (request.kind) {
      case "iso":
        camera.position.copy(at(-58, 32, distance));
        break;
      case "top":
        camera.position.copy(at(-90, 89.5, distance));
        break;
      case "front":
        camera.position.copy(at(-90, 6, distance));
        break;
      case "in":
        camera.position.copy((controls?.target ?? centre).clone().add(offset.multiplyScalar(1 / 1.2)));
        break;
      case "out":
        camera.position.copy((controls?.target ?? centre).clone().add(offset.multiplyScalar(1.2)));
        break;
    }
    if (request.kind !== "in" && request.kind !== "out") controls?.target.copy(centre);
    controls?.update();
    // Only explicit requests move the camera; editing the scene must not.
  }, [request.nonce]);
  return null;
}

export interface ViewportProps {
  draft: Draft;
  placed: Placed[];
  geometries: { asset: Asset; geometry?: BufferGeometry; error?: string }[];
  scene: number;
  selectedBin: number;
  selectedCamera: number;
  centre: Vec3;
  legend: { label: string; sub?: string; color: string }[];
  colorBy: ColorBy;
  onColorBy: (value: ColorBy) => void;
  inFrame: number;
}

export function Viewport(props: ViewportProps) {
  const { draft, placed, geometries, scene, selectedBin, selectedCamera, centre, colorBy } = props;
  const [frusta, setFrusta] = useState(true);
  const [request, setRequest] = useState<ViewRequest>({ kind: "iso", nonce: 0 });
  const view = (kind: ViewRequest["kind"]) => setRequest((r) => ({ kind, nonce: r.nonce + 1 }));
  const extent = useMemo(() => {
    const xs = draft.bins.flatMap((b) => [b.world_from_bin.translation[0] - b.inner_dimensions_m[0] / 2, b.world_from_bin.translation[0] + b.inner_dimensions_m[0] / 2]);
    const ys = draft.bins.flatMap((b) => [b.world_from_bin.translation[1] - b.inner_dimensions_m[1] / 2, b.world_from_bin.translation[1] + b.inner_dimensions_m[1] / 2]);
    return Math.max(0.6, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }, [draft.bins]);
  const orbitTarget: Vec3 = [centre[0], centre[1], 0.15];
  const camera = draft.cameras[selectedCamera] ?? draft.cameras[0];

  return (
    <div className="viewport">
      <Canvas
        camera={{ position: [centre[0] + 1.2, centre[1] - 1.9, 1.3], up: [0, 0, 1], fov: 30, near: 0.01, far: 100 }}
        dpr={[1, 2]}
        style={{ position: "absolute", inset: 0 }}
      >
        <color attach="background" args={["#08090b"]} />
        <RoomLighting />
        <KeyLight draft={draft} />
        <gridHelper
          args={[8, 80, "#262a31", "#15181c"]}
          rotation={[Math.PI / 2, 0, 0]}
          position={[Math.round(centre[0] * 10) / 10, Math.round(centre[1] * 10) / 10, -0.025]}
        />
        <SceneContent draft={draft} placed={placed} geometries={geometries} colorBy={colorBy} editorial selectedBin={selectedBin} />
        {frusta &&
          draft.cameras.map((c, i) => (
            <Frustum key={c.id} draft={draft} camera={c} scene={scene} selected={i === selectedCamera} centre={centre} />
          ))}
        <OrbitControls makeDefault target={orbitTarget} enableDamping={false} />
        <ViewController request={request} target={orbitTarget} extent={extent} />
      </Canvas>

      <div className="hud">
        <div style={{ display: "flex", gap: 6 }}>
          <div className="ctl seg glass" role="group" aria-label="View">
            <button type="button" onClick={() => view("iso")}>Iso</button>
            <button type="button" onClick={() => view("top")}>Top</button>
            <button type="button" onClick={() => view("front")}>Front</button>
          </div>
          <button type="button" className="ctl ibtn glass" aria-label="Zoom out" onClick={() => view("out")}>
            <MinusIcon />
          </button>
          <button type="button" className="ctl ibtn glass" aria-label="Zoom in" onClick={() => view("in")}>
            <PlusIcon />
          </button>
          <button
            type="button"
            className="ctl ibtn glass"
            aria-label="Camera frustums"
            aria-pressed={frusta}
            onClick={() => setFrusta((f) => !f)}
          >
            <CameraIcon size={15} />
          </button>
        </div>
        <Seg
          label="Color objects by"
          className="glass"
          options={[
            { value: "asset", label: "Asset" },
            { value: "material", label: "Material" },
          ]}
          value={colorBy}
          onChange={props.onColorBy}
        />
      </div>

      <div className="legend">
        {props.legend.map((item) => (
          <span key={item.label} className="ctl glass">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />
            <Parts items={item.sub ? [item.label, <span className="muted">{item.sub}</span>] : [item.label]} />
          </span>
        ))}
      </div>

      {camera && <CameraInset {...props} camera={camera} />}
    </div>
  );
}

/** The selected dataset camera's view of the preview. */
function CameraInset({ draft, placed, geometries, scene, colorBy, camera, inFrame }: ViewportProps & { camera: Camera }) {
  const pose = cameraPose(draft, camera, scene);
  const aspect = camera.image_size.width / camera.image_size.height;
  const width = aspect >= 1 ? 232 : Math.round(184 * aspect);
  const height = aspect >= 1 ? Math.round(232 / aspect) : 184;
  const mode = "shell" in camera.pose ? "shell" : "fixed";
  return (
    <figure className="inset glass">
      <figcaption className="row mono" style={{ fontSize: 11 }}>
        <Parts items={[`cam ${camera.id}`, mode]} />
        <span className="muted">
          {inFrame}/{placed.length} in frame
        </span>
      </figcaption>
      <div style={{ width, height, borderRadius: 4, overflow: "hidden" }}>
        <Canvas dpr={[1, 2]} style={{ width, height }}>
          <color attach="background" args={["#0d0d0f"]} />
          <RoomLighting />
          <KeyLight draft={draft} />
          <PerspectiveCamera
            makeDefault
            position={pose.translation}
            quaternion={threeCameraQuaternion(pose.rotation_xyzw)}
            fov={verticalFov(camera)}
            aspect={aspect}
            near={camera.near_m}
            far={camera.far_m}
          />
          <SceneContent draft={draft} placed={placed} geometries={geometries} colorBy={colorBy} editorial={false} />
        </Canvas>
      </div>
    </figure>
  );
}
