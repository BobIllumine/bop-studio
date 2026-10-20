import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import { fixedPose, fixedPoseAngles, lookAt, threeCameraQuaternion } from "../pose";

const close = (actual: number[], expected: number[]) =>
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 5));

describe("camera poses", () => {
  it("reproduce the presets' straight-down camera", () => {
    // smoke.toml: translation [0, 0, 1], rotation_xyzw [-0.70710678, 0, 0, 0.70710678]
    const pose = fixedPose([0, 0, 0], -90, 90, 1);
    close(pose.translation, [0, 0, 1]);
    close(pose.rotation_xyzw, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
  });

  it("read back the angles they were built from", () => {
    for (const [az, el, r] of [
      [30, 60, 0.9],
      [-90, 90, 1],
      [135, 20, 2],
    ] as const) {
      const angles = fixedPoseAngles(fixedPose([0.1, 0, 0.05], az, el, r), [0.1, 0, 0.05]);
      expect(angles.azimuthDeg).toBeCloseTo(az, 3);
      expect(angles.elevationDeg).toBeCloseTo(el, 3);
      expect(angles.radius).toBeCloseTo(r, 5);
    }
  });

  it("look along +Y in the camera frame and -Z in three.js", () => {
    const rotation = lookAt([0, -1, 0], [0, 0, 0]);
    const forward = new Vector3(0, 0, -1).applyQuaternion(threeCameraQuaternion(rotation));
    close(forward.toArray(), [0, 1, 0]);
    const up = new Vector3(0, 1, 0).applyQuaternion(threeCameraQuaternion(rotation));
    close(up.toArray(), [0, 0, 1]);
  });
});
