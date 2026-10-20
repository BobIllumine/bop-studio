import { Matrix4, Quaternion, Vector3 } from "three";

import type { Quat, ShellPose, Transform, Vec3 } from "./types";

// Camera poses use bop-core's Z-up camera frame: X right, Y forward (the
// viewing direction), Z up. three.js cameras look down -Z with +Y up, which is
// that frame turned +90° about X.
const THREE_FROM_BOP_CAMERA = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

/** World rotation of a three.js camera placed at a bop camera pose. */
export function threeCameraQuaternion(rotation: Quat): Quaternion {
  return new Quaternion(...rotation).multiply(THREE_FROM_BOP_CAMERA);
}

/**
 * The rotation that looks from `eye` at `target`, built exactly as bop-pipeline
 * builds shell poses: right = forward × up, falling back to X (or Y) when the
 * view is parallel to `up`.
 */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 0, 1]): Quat {
  const forward = new Vector3(...target).sub(new Vector3(...eye)).normalize();
  let right = forward.clone().cross(new Vector3(...up));
  if (right.lengthSq() <= 64 * Number.EPSILON) {
    const fallback = Math.abs(forward.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    right = forward.clone().cross(fallback);
  }
  right.normalize();
  const cameraUp = right.clone().cross(forward).normalize();
  const basis = new Matrix4().makeBasis(right, forward, cameraUp);
  const q = new Quaternion().setFromRotationMatrix(basis).normalize();
  return [q.x, q.y, q.z, q.w];
}

/** A point on the shell around `target`, as bop-pipeline places shell cameras. */
export function shellPoint(target: Vec3, azimuthDeg: number, elevationDeg: number, radius: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return [
    target[0] + radius * Math.cos(el) * Math.cos(az),
    target[1] + radius * Math.cos(el) * Math.sin(az),
    target[2] + radius * Math.sin(el),
  ];
}

/** Elevations this close to 90° look straight down. */
const STRAIGHT_DOWN_DEG = 89.99;

/**
 * A fixed pose on the shell around `target`, looking at it. Looking straight
 * down, the azimuth decides which way image-up points (away from the camera's
 * azimuth), so the image turns continuously as the elevation reaches 90°.
 */
export function fixedPose(target: Vec3, azimuthDeg: number, elevationDeg: number, radius: number): Transform {
  const eye = shellPoint(target, azimuthDeg, elevationDeg, radius);
  const az = (azimuthDeg * Math.PI) / 180;
  const up: Vec3 = elevationDeg >= STRAIGHT_DOWN_DEG ? [-Math.cos(az), -Math.sin(az), 0] : [0, 0, 1];
  return {
    translation: eye.map(round6) as Vec3,
    rotation_xyzw: lookAt(eye, target, up).map(round6) as Quat,
  };
}

/**
 * Azimuth, elevation and distance of a fixed pose around `target`; the inverse
 * of [`fixedPose`]. Straight down, the azimuth is read from image-up.
 */
export function fixedPoseAngles(
  pose: Transform,
  target: Vec3,
): { azimuthDeg: number; elevationDeg: number; radius: number } {
  const [x, y, z] = pose.translation;
  const dx = x - target[0];
  const dy = y - target[1];
  const dz = z - target[2];
  const radius = Math.hypot(dx, dy, dz) || 1;
  const elevationDeg = (Math.asin(Math.min(1, Math.max(-1, dz / radius))) * 180) / Math.PI;
  let azimuthDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (elevationDeg >= STRAIGHT_DOWN_DEG) {
    const up = new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...pose.rotation_xyzw));
    azimuthDeg = (Math.atan2(-up.y, -up.x) * 180) / Math.PI;
  }
  return { azimuthDeg, elevationDeg, radius };
}

/**
 * Preview poses for a shell camera. The server derives its samples from the
 * run seed with BLAKE3; these only show the reachable region, scene by scene.
 */
export function shellSample(shell: ShellPose, binTranslation: Vec3, scene: number, cameraId: number): Transform {
  const random = mulberry32(scene * 7919 + cameraId * 104_729 + 17);
  const lerp = (a: number, b: number) => a + (b - a) * random();
  const radius = lerp(shell.min_radius_m, shell.max_radius_m);
  const azimuth = lerp(shell.min_azimuth_deg, shell.max_azimuth_deg);
  const elevation = lerp(shell.min_elevation_deg, shell.max_elevation_deg);
  const target: Vec3 = [
    binTranslation[0] + shell.target_bin_m[0],
    binTranslation[1] + shell.target_bin_m[1],
    binTranslation[2] + shell.target_bin_m[2],
  ];
  const eye = shellPoint(target, azimuth, elevation, radius);
  return { translation: eye, rotation_xyzw: lookAt(eye, target) };
}

/** Small seeded generator for preview-only randomness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
