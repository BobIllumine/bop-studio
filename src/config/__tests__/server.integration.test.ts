// Runs only against a live server: BOP_SERVER_URL=http://localhost:8080 bun run test
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { draftToToml, parseDraft } from "../draft";
import { fixedPose } from "../pose";

const server = process.env.BOP_SERVER_URL;
const preset = (name: string) => readFileSync(join(__dirname, "../presets", `${name}.toml`), "utf8");

async function validate(config: string) {
  const response = await fetch(`${server}/api/v1/configs/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe.skipIf(!server)("configurations the studio writes", () => {
  it.each(["smoke", "small", "medium", "stress", "two_bins"])("%s is accepted by the server", async (name) => {
    const { status, body } = await validate(draftToToml(parseDraft(preset(name))));
    expect(body).not.toHaveProperty("error");
    expect(status).toBe(200);
  });

  it("an edited draft with a new bin, camera and materials is accepted", async () => {
    const draft = parseDraft(preset("smoke"));
    const copy = structuredClone(draft.bins[0]!);
    copy.id = "bin_2";
    copy.world_from_bin.translation = [0.7, 0, 0];
    draft.bins.push(copy);
    draft.cameras.push({ ...draft.cameras[0]!, id: 2, pose: { fixed_world_from_camera: fixedPose([0.35, 0, 0], 30, 60, 1.4) } });
    draft.bins[0]!.render_material = { base_color_srgb: [0.12, 0.32, 0.62, 1], metallic: 0, roughness: 0.6 };
    draft.assets[0]!.visual_override = {
      base_color_srgb: [0.56, 0.57, 0.58, 1],
      metallic: { kind: "uniform", min: 0.9, max: 1 },
      roughness: { kind: "uniform", min: 0.35, max: 0.55 },
    };
    const { status, body } = await validate(draftToToml(draft));
    expect(body).not.toHaveProperty("error");
    expect(status).toBe(200);
  });
});
