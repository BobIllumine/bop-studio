import { PerspectiveCamera, Vector3 } from "three";

import { threeCameraQuaternion } from "../config/pose";
import type { Camera, Draft, Transform } from "../config/types";
import type { Extent, Placed } from "./placement";

export type Level = "ok" | "warn" | "error";
export interface Check {
  level: Level;
  text: string;
}

/** A three.js camera matching a dataset camera at `pose`. */
export function threeCamera(camera: Camera, pose: Transform, fovDeg: number): PerspectiveCamera {
  const view = new PerspectiveCamera(fovDeg, camera.image_size.width / camera.image_size.height, camera.near_m, camera.far_m);
  view.position.set(...pose.translation);
  view.quaternion.copy(threeCameraQuaternion(pose.rotation_xyzw));
  view.updateMatrixWorld();
  view.updateProjectionMatrix();
  return view;
}

/** Whether a world point lands inside the image and between the clip planes. */
export function inView(view: PerspectiveCamera, point: Vector3): boolean {
  const ndc = point.clone().project(view);
  return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z >= -1 && ndc.z <= 1;
}

/** Problems the preview can see before the server simulates anything. */
export function previewChecks(
  draft: Draft,
  scene: number,
  placed: Placed[],
  extents: Record<string, Extent | undefined>,
  views: { camera: Camera; view: PerspectiveCamera }[],
): Check[] {
  const checks: Check[] = [];

  draft.bins.forEach((a, i) =>
    draft.bins.slice(i + 1).forEach((b) => {
      const [ax, ay] = a.world_from_bin.translation;
      const [bx, by] = b.world_from_bin.translation;
      const reach = (bin: typeof a, axis: 0 | 1) => bin.inner_dimensions_m[axis] / 2 + bin.wall_thickness_m;
      if (Math.abs(ax - bx) < reach(a, 0) + reach(b, 0) && Math.abs(ay - by) < reach(a, 1) + reach(b, 1)) {
        checks.push({ level: "error", text: `Bins "${a.id}" and "${b.id}" overlap. Bins may not overlap.` });
      }
    }),
  );

  for (const { camera, view } of views) {
    for (const bin of draft.bins) {
      const [w, d] = bin.inner_dimensions_m;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) => new Vector3(x! * (w / 2), y! * (d / 2), 0).add(new Vector3(...bin.world_from_bin.translation)));
      if (!corners.every((corner) => inView(view, corner))) {
        checks.push({ level: "warn", text: `cam ${camera.id} crops the floor of bin "${bin.id}" in preview scene ${scene}.` });
      }
    }
  }

  draft.bins.forEach((bin, index) => {
    const objects = placed.filter((p) => p.bin === index);
    if (objects.length === 0) {
      checks.push({ level: "error", text: `Bin "${bin.id}" has no objects.` });
      return;
    }
    const [w, d, h] = bin.inner_dimensions_m;
    const volume = objects.reduce((sum, p) => {
      const e = extents[p.assetId];
      return e ? sum + (e.max[0] - e.min[0]) * (e.max[1] - e.min[1]) * (e.max[2] - e.min[2]) : sum;
    }, 0);
    const fill = volume / (w * d * h);
    if (fill > 0.35) {
      checks.push({
        level: "warn",
        text: `Bin "${bin.id}" is densely filled (bounding boxes take ${Math.round(fill * 100)}% of it). Expect more rejected scene attempts.`,
      });
    }
    const over = objects.filter((p) => p.top > h).length;
    if (over > 0) {
      checks.push({
        level: "warn",
        text: `${over} object(s) in bin "${bin.id}" pile above the rim in this preview; they are likely to escape and get the attempt rejected.`,
      });
    }
  });

  return checks;
}
