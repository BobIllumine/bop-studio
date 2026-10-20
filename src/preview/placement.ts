import { Matrix4, Quaternion, Vector3 } from "three";

import { sharesFromMixture } from "../config/draft";
import { mulberry32 } from "../config/pose";
import type { Distribution, Draft } from "../config/types";

/** An asset's axis-aligned extent in metres, after unit scale and model transform. */
export interface Extent {
  min: [number, number, number];
  max: [number, number, number];
}

/** One previewed object. */
export interface Placed {
  bin: number;
  assetId: string;
  /** World transform of the asset's model frame (unit scale excluded). */
  matrix: Matrix4;
  /** Height of the object's top above its bin floor. */
  top: number;
  /** Footprint centre in bin coordinates, for checks. */
  local: [number, number];
}

/** Stand-in extent for assets whose mesh has not loaded: a 5 cm cube. */
export const FALLBACK_EXTENT: Extent = { min: [-0.025, -0.025, -0.025], max: [0.025, 0.025, 0.025] };

function sampleCount(count: Distribution, random: () => number): number {
  switch (count.kind) {
    case "fixed":
      return count.value;
    case "uniform":
      return Math.floor(count.min + random() * (count.max - count.min + 1));
    case "choice": {
      const total = count.values.reduce((sum, v) => sum + v.weight, 0);
      let pick = random() * total;
      for (const { value, weight } of count.values) {
        if ((pick -= weight) <= 0) return value;
      }
      return count.values[count.values.length - 1]?.value ?? 0;
    }
  }
}

/**
 * A quick stand-in for a settled scene: each object takes a seeded asset and
 * yaw, a random spot in its bin, and rests on whatever it overlaps. It is not
 * physics; the server's Rapier simulation decides the real scene.
 */
export function placeScene(draft: Draft, scene: number, extents: Record<string, Extent | undefined>): Placed[] {
  const random = mulberry32(draft.run.master_seed * 7919 + scene * 104_729 + 1);
  const ids = draft.assets.map((asset) => asset.id);
  const placed: Placed[] = [];
  draft.bins.forEach((bin, binIndex) => {
    const shares = sharesFromMixture(bin.population.asset_mixture, ids);
    const weights = ids.map((id) => shares[id] ?? 0);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const count = totalWeight > 0 ? sampleCount(bin.population.object_count, random) : 0;
    const [w, d] = bin.inner_dimensions_m;
    const binMatrix = new Matrix4().compose(
      new Vector3(...bin.world_from_bin.translation),
      new Quaternion(...bin.world_from_bin.rotation_xyzw),
      new Vector3(1, 1, 1),
    );
    const inBin: { x: number; y: number; hx: number; hy: number; top: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      let pick = random() * totalWeight;
      let index = 0;
      while (index < weights.length - 1 && pick >= weights[index]!) {
        pick -= weights[index]!;
        index += 1;
      }
      const assetId = ids[index]!;
      const extent = extents[assetId] ?? FALLBACK_EXTENT;
      const yaw = random() * Math.PI * 2;
      const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
      // Footprint of the yawed extent.
      let hx = 0;
      let hy = 0;
      for (const ex of [extent.min[0], extent.max[0]]) {
        for (const ey of [extent.min[1], extent.max[1]]) {
          hx = Math.max(hx, Math.abs(ex * cos - ey * sin));
          hy = Math.max(hy, Math.abs(ex * sin + ey * cos));
        }
      }
      const spanX = Math.max(0, w - 2 * hx);
      const spanY = Math.max(0, d - 2 * hy);
      const x = -spanX / 2 + random() * spanX;
      const y = -spanY / 2 + random() * spanY;
      let base = 0;
      for (const other of inBin) {
        if (Math.abs(x - other.x) < (hx + other.hx) * 0.85 && Math.abs(y - other.y) < (hy + other.hy) * 0.85) {
          base = Math.max(base, other.top);
        }
      }
      const height = extent.max[2] - extent.min[2];
      const top = base + height;
      inBin.push({ x, y, hx, hy, top });
      const local = new Matrix4().compose(
        new Vector3(x, y, base - extent.min[2]),
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), yaw),
        new Vector3(1, 1, 1),
      );
      placed.push({ bin: binIndex, assetId, matrix: binMatrix.clone().multiply(local), top, local: [x, y] });
    }
  });
  return placed;
}
