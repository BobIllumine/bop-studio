import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  draftToToml,
  mixtureFromShares,
  parseDraft,
  rebalance,
  sharesFromMixture,
  spawnVolumeFor,
  toPercentages,
} from "../draft";

const preset = (name: string) => readFileSync(join(__dirname, "../presets", `${name}.toml`), "utf8");

describe("drafts", () => {
  it.each(["smoke", "small", "medium", "stress", "two_bins"])("%s survives a round trip", (name) => {
    const draft = parseDraft(preset(name));
    expect(parseDraft(draftToToml(draft))).toEqual(draft);
  });

  it("normalizes [bin] to one bin and writes it back as [bin]", () => {
    const draft = parseDraft(preset("smoke"));
    expect(draft.bins.map((bin) => bin.id)).toEqual(["bin"]);
    expect(draft.bins[0]!.population.object_count).toEqual({ kind: "fixed", value: 10 });
    const toml = draftToToml(draft);
    expect(toml).toMatch(/^\[bin\]$/m);
    expect(toml).toMatch(/^\[population\]$/m);
    expect(toml).not.toMatch(/bins/);
  });

  it("keeps several bins as [[bins]] with their populations", () => {
    const draft = parseDraft(preset("two_bins"));
    expect(draft.bins.map((bin) => bin.id)).toEqual(["left", "right"]);
    const toml = draftToToml(draft);
    expect(toml).toMatch(/^\[\[bins\]\]$/m);
    expect(toml).toMatch(/^\[bins\.population\]$/m);
  });

  it("writes whole numbers and floats the schema accepts", () => {
    const toml = draftToToml(parseDraft(preset("smoke")));
    expect(toml).toMatch(/master_seed = 1\n/);
    expect(toml).toMatch(/inner_dimensions_m = \[0\.6, 0\.4, 0\.5\]/);
    expect(toml).toMatch(/^pose = \{ fixed_world_from_camera = \{ translation = \[0, 0, 1\]/m);
  });
});

describe("asset shares", () => {
  const ids = ["cup", "nippel"];

  it("reads fixed and choice mixtures as percentages", () => {
    expect(sharesFromMixture({ kind: "fixed", value: "cup" }, ids)).toEqual({ cup: 100, nippel: 0 });
    expect(
      sharesFromMixture({ kind: "choice", values: [{ value: "cup", weight: 0.95 }, { value: "nippel", weight: 0.05 }] }, ids),
    ).toEqual({ cup: 95, nippel: 5 });
  });

  it("writes a single asset as fixed and several as choice", () => {
    expect(mixtureFromShares({ cup: 100, nippel: 0 }, ids)).toEqual({ kind: "fixed", value: "cup" });
    expect(mixtureFromShares({ cup: 60, nippel: 40 }, ids)).toEqual({
      kind: "choice",
      values: [
        { value: "cup", weight: 0.6 },
        { value: "nippel", weight: 0.4 },
      ],
    });
  });

  it("always sums to 100", () => {
    const shares = toPercentages({ a: 1, b: 1, c: 1 }, ["a", "b", "c"]);
    expect(Object.values(shares).reduce((x, y) => x + y)).toBe(100);
    const added = rebalance({ a: 34, b: 33, c: 33 }, ["a", "b", "c", "d"], "d");
    expect(added.d).toBe(25);
    expect(Object.values(added).reduce((x, y) => x + y)).toBe(100);
    const removed = rebalance({ a: 50, b: 30, c: 20 }, ["a", "b"], null);
    expect(removed).toEqual({ a: 63, b: 37 });
  });
});

describe("spawn volumes", () => {
  it("match the presets' margins", () => {
    expect(spawnVolumeFor([0.6, 0.4, 0.5])).toEqual({ min_m: [-0.26, -0.16, 0.05], max_m: [0.26, 0.16, 0.48] });
  });
});
