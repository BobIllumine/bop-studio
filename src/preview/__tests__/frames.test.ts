import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { decodeDepthExr, decodeGray16Png, depthRange, indexScenes, labelColor } from "../frames";

const fixture = (name: string) => {
  const bytes = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

describe("indexScenes", () => {
  it("groups channels by scene and camera, in numeric order", () => {
    const scenes = indexScenes([
      "run.json",
      "bop/train_pbr/000002/rgb/000001.png",
      "scenes/00000000000000000010/frames/00002/rgb.png",
      "scenes/00000000000000000010/frames/00001/rgb.png",
      "scenes/00000000000000000010/frames/00001/depth.exr",
      "scenes/00000000000000000010/frames/00001/frame.json",
      "scenes/00000000000000000010/scene.json",
      "scenes/00000000000000000002/frames/00001/instance.png",
      "scenes/00000000000000000003/scene.json",
    ]);
    expect(scenes).toEqual([
      { scene: 2, metadata: undefined, frames: [{ camera: 1, paths: { instance: "scenes/00000000000000000002/frames/00001/instance.png" } }] },
      {
        scene: 10,
        metadata: "scenes/00000000000000000010/scene.json",
        frames: [
          {
            camera: 1,
            paths: { rgb: "scenes/00000000000000000010/frames/00001/rgb.png", depth: "scenes/00000000000000000010/frames/00001/depth.exr" },
          },
          { camera: 2, paths: { rgb: "scenes/00000000000000000010/frames/00002/rgb.png" } },
        ],
      },
    ]);
  });
});

describe("decodeGray16Png", () => {
  it("reads every instance label of a stored frame", async () => {
    const image = await decodeGray16Png(fixture("instance.png"));
    expect([image.width, image.height]).toEqual([256, 256]);
    const counts = new Map<number, number>();
    for (const id of image.labels) counts.set(id, (counts.get(id) ?? 0) + 1);
    // Reference counts from PIL.
    expect(Object.fromEntries(counts)).toEqual({
      0: 64022, 1: 151, 2: 168, 3: 133, 4: 142, 5: 161, 6: 163, 7: 146, 8: 141, 9: 150, 10: 159,
    });
  });

  it("rejects 8-bit images", async () => {
    const bytes = new Uint8Array(fixture("instance.png"));
    bytes[24] = 8; // IHDR bit depth
    await expect(decodeGray16Png(bytes.buffer)).rejects.toThrow("16-bit grayscale");
  });
});

describe("decodeDepthExr", () => {
  it("reads a tiled RLE depth frame, partial edge tiles included", () => {
    // 70×20 frame written by bop-dataset: depth = 0.5 + 0.01·x + 0.001·y metres, 0 where x < 5.
    const depth = decodeDepthExr(fixture("depth.exr"));
    expect([depth.width, depth.height]).toEqual([70, 20]);
    for (const [x, y] of [[0, 0], [4, 19], [5, 0], [63, 7], [64, 7], [69, 19]] as const) {
      const expected = x < 5 ? 0 : 0.5 + 0.01 * x + 0.001 * y;
      expect(depth.metres[y * 70 + x]).toBeCloseTo(expected, 6);
    }
    expect(depthRange(depth)[0]).toBeCloseTo(0.55, 6);
  });
});

describe("labelColor", () => {
  it("is stable and separates neighbouring IDs", () => {
    expect(labelColor(3)).toEqual(labelColor(3));
    expect(labelColor(1)).not.toEqual(labelColor(2));
  });
});
