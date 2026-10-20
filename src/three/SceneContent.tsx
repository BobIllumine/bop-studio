import { Html, Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  PMREMGenerator,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { Asset, Bin, Camera, Draft, Transform, Vec3 } from "../config/types";
import { shellSample, threeCameraQuaternion } from "../config/pose";
import { FALLBACK_EXTENT, type Placed } from "../preview/placement";
import { modelMatrix } from "./assetGeometry";

export const ASSET_COLORS = ["#6C9CFF", "#FF9E57", "#C59BFF", "#4FCFA6", "#F3D36B", "#F07CA8", "#7FD3E8", "#B7D36B"];
export const assetColor = (index: number) => ASSET_COLORS[index % ASSET_COLORS.length]!;

export type ColorBy = "asset" | "material";

const srgb = (r: number, g: number, b: number) => new Color().setRGB(r, g, b, SRGBColorSpace);

/** Image-based lighting from three's procedural room, so metals read without network assets. */
export function RoomLighting({ intensity = 0.55 }: { intensity?: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const texture = generator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      texture.dispose();
      generator.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

/** The scene's key light, from `[appearance] directional_lights`. */
export function KeyLight({ draft }: { draft: Draft }) {
  const lights = (draft.appearance.directional_lights as { direction_world?: Vec3 }[] | undefined) ?? [];
  const direction = lights[0]?.direction_world ?? [0.3, 0.2, -1];
  const position = new Vector3(...direction).normalize().multiplyScalar(-4);
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={position} intensity={1.6} />
    </>
  );
}

function BinMesh({ bin, transparent, colorBy }: { bin: Bin; transparent: boolean; colorBy: ColorBy }) {
  const [w, d, h] = bin.inner_dimensions_m;
  const t = bin.wall_thickness_m;
  const f = bin.floor_thickness_m;
  const material = bin.render_material;
  const color =
    colorBy === "asset" || !material ? srgb(0.25, 0.27, 0.3) : srgb(material.base_color_srgb[0], material.base_color_srgb[1], material.base_color_srgb[2]);
  const surface = (
    <meshStandardMaterial
      color={color}
      metalness={colorBy === "asset" ? 0 : (material?.metallic ?? 0)}
      roughness={colorBy === "asset" ? 0.8 : (material?.roughness ?? 0.6)}
      transparent={transparent}
      opacity={transparent ? 0.32 : 1}
      depthWrite={!transparent}
    />
  );
  const walls: [Vec3, Vec3][] = [
    [[w / 2 + t / 2, 0, h / 2], [t, d + 2 * t, h]],
    [[-w / 2 - t / 2, 0, h / 2], [t, d + 2 * t, h]],
    [[0, d / 2 + t / 2, h / 2], [w, t, h]],
    [[0, -d / 2 - t / 2, h / 2], [w, t, h]],
  ];
  return (
    <group position={bin.world_from_bin.translation} quaternion={new Quaternion(...bin.world_from_bin.rotation_xyzw)}>
      <mesh position={[0, 0, -f / 2]}>
        <boxGeometry args={[w + 2 * t, d + 2 * t, f]} />
        <meshStandardMaterial
          color={color}
          metalness={colorBy === "asset" ? 0 : (material?.metallic ?? 0)}
          roughness={colorBy === "asset" ? 0.8 : (material?.roughness ?? 0.6)}
        />
      </mesh>
      {walls.map(([position, size], i) => (
        <mesh key={i} position={position} renderOrder={transparent ? 2 : 0}>
          <boxGeometry args={size} />
          {surface}
        </mesh>
      ))}
    </group>
  );
}

/** A dashed outline around the selected bin's rim, and its name label. */
function BinMarker({ bin, selected }: { bin: Bin; selected: boolean }) {
  const [w, d, h] = bin.inner_dimensions_m;
  const t = bin.wall_thickness_m;
  const rim: Vec3[] = [
    [-w / 2 - t, -d / 2 - t, h],
    [w / 2 + t, -d / 2 - t, h],
    [w / 2 + t, d / 2 + t, h],
    [-w / 2 - t, d / 2 + t, h],
    [-w / 2 - t, -d / 2 - t, h],
  ];
  return (
    <group position={bin.world_from_bin.translation} quaternion={new Quaternion(...bin.world_from_bin.rotation_xyzw)}>
      {selected && <Line points={rim} color="#ECEEF1" lineWidth={1.5} dashed dashSize={0.03} gapSize={0.02} />}
      <Html position={[0, d / 2 + t, h + 0.06]} zIndexRange={[10, 0]}>
        <div className={`bin-label${selected ? " on" : ""}`}>{bin.id}</div>
      </Html>
    </group>
  );
}

function Instances({
  asset,
  geometry,
  failed,
  placed,
  color,
  metalness,
  roughness,
}: {
  asset: Asset;
  geometry: BufferGeometry | undefined;
  failed: boolean;
  placed: Placed[];
  color: Color;
  metalness: number;
  roughness: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const fallback = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const model = modelMatrix(asset);
    const [lo, hi] = [FALLBACK_EXTENT.min, FALLBACK_EXTENT.max];
    const box = new Matrix4().compose(
      new Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2),
      new Quaternion(),
      new Vector3(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]),
    );
    placed.forEach((p, i) => {
      mesh.setMatrixAt(i, geometry ? p.matrix.clone().multiply(model) : p.matrix.clone().multiply(box));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [asset, geometry, placed]);
  if (placed.length === 0) return null;
  return (
    <instancedMesh key={`${placed.length}-${geometry ? "mesh" : "box"}`} ref={ref} args={[geometry ?? fallback, undefined, placed.length]}>
      <meshStandardMaterial
        color={failed ? new Color("#F07C6D") : color}
        metalness={metalness}
        roughness={roughness}
        transparent={!geometry && !failed}
        opacity={!geometry && !failed ? 0.45 : 1}
      />
    </instancedMesh>
  );
}

export interface SceneContentProps {
  draft: Draft;
  placed: Placed[];
  geometries: { asset: Asset; geometry?: BufferGeometry; error?: string }[];
  colorBy: ColorBy;
  /** Viewport: translucent walls and labels; camera views: opaque, unlabelled. */
  editorial: boolean;
  selectedBin?: number;
}

export function SceneContent({ draft, placed, geometries, colorBy, editorial, selectedBin }: SceneContentProps) {
  return (
    <>
      {draft.bins.map((bin) => (
        <BinMesh key={bin.id} bin={bin} transparent={editorial} colorBy={colorBy} />
      ))}
      {editorial && draft.bins.map((bin, i) => <BinMarker key={bin.id} bin={bin} selected={i === selectedBin} />)}
      {geometries.map(({ asset, geometry, error }, index) => {
        const override = asset.visual_override;
        const mid = (v: unknown) => {
          const d = v as { kind: string; value?: number; min?: number; max?: number } | undefined;
          if (!d) return undefined;
          return d.kind === "fixed" ? d.value : d.kind === "uniform" ? ((d.min ?? 0) + (d.max ?? 0)) / 2 : undefined;
        };
        const byMaterial = colorBy === "material";
        const color = byMaterial
          ? override
            ? srgb(override.base_color_srgb[0], override.base_color_srgb[1], override.base_color_srgb[2])
            : srgb(0.7, 0.7, 0.72)
          : new Color(assetColor(index));
        return (
          <Instances
            key={asset.id}
            asset={asset}
            geometry={geometry}
            failed={Boolean(error)}
            placed={placed.filter((p) => p.assetId === asset.id)}
            color={color}
            metalness={byMaterial ? (mid(override?.metallic) ?? 0) : 0}
            roughness={byMaterial ? (mid(override?.roughness) ?? 0.6) : 0.55}
          />
        );
      })}
    </>
  );
}

/** Where a dataset camera is in a given scene, and how far it looks. */
export function cameraPose(draft: Draft, camera: Camera, scene: number): Transform {
  if ("fixed_world_from_camera" in camera.pose) return camera.pose.fixed_world_from_camera;
  const bin = draft.bins[0];
  return shellSample(camera.pose.shell, bin?.world_from_bin.translation ?? [0, 0, 0], scene, camera.id);
}

export function verticalFov(camera: Camera): number {
  if ("vertical_fov_deg" in camera.projection) return camera.projection.vertical_fov_deg;
  const k = camera.projection.opencv_k;
  const fy = k[4] ?? 1;
  return (2 * Math.atan(camera.image_size.height / 2 / fy) * 180) / Math.PI;
}

/** A camera's view volume drawn to the depth of the scene centre. */
export function Frustum({
  draft,
  camera,
  scene,
  selected,
  centre,
}: {
  draft: Draft;
  camera: Camera;
  scene: number;
  selected: boolean;
  centre: Vec3;
}) {
  const pose = cameraPose(draft, camera, scene);
  const eye = new Vector3(...pose.translation);
  const q = threeCameraQuaternion(pose.rotation_xyzw);
  const forward = new Vector3(0, 0, -1).applyQuaternion(q);
  const right = new Vector3(1, 0, 0).applyQuaternion(q);
  const up = new Vector3(0, 1, 0).applyQuaternion(q);
  const depth = Math.max(0.2, new Vector3(...centre).sub(eye).dot(forward));
  const halfH = Math.tan(((verticalFov(camera) / 2) * Math.PI) / 180) * depth;
  const halfW = (halfH * camera.image_size.width) / camera.image_size.height;
  const centreFar = eye.clone().addScaledVector(forward, depth);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => centreFar.clone().addScaledVector(right, x! * halfW).addScaledVector(up, y! * halfH));
  const color = selected ? "#ECEEF1" : "#5A606A";
  const shellDots = useMemo(() => {
    if (!("shell" in camera.pose)) return null;
    return Array.from({ length: 32 }, (_, k) => cameraPose(draft, camera, k).translation);
  }, [draft, camera]);
  return (
    <group>
      <Line points={[...corners, corners[0]!]} color={color} lineWidth={selected ? 1.4 : 1} transparent opacity={selected ? 1 : 0.45} />
      {corners.map((corner, i) => (
        <Line key={i} points={[eye, corner]} color={color} lineWidth={selected ? 1.2 : 1} transparent opacity={selected ? 0.9 : 0.35} />
      ))}
      <mesh position={eye} quaternion={q}>
        <boxGeometry args={[0.05, 0.035, 0.035]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {shellDots?.map((point, i) => (
        <mesh key={i} position={point}>
          <sphereGeometry args={[selected ? 0.008 : 0.005, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={selected ? 0.75 : 0.3} />
        </mesh>
      ))}
      <Html position={eye} zIndexRange={[10, 0]}>
        <div className="mono" style={{ color, fontSize: 11, transform: "translate(10px, -22px)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          cam {camera.id}
        </div>
      </Html>
    </group>
  );
}
