import { parse } from "smol-toml";

import type { Asset, AssetMixture, Bin, Draft, Population } from "./types";

/** The id a `[bin]` file's single bin gets, as bop-core names it. */
export const SINGLE_BIN_ID = "bin";

/**
 * Parses a run configuration and normalizes `[bin]` + `[population]` to one
 * `[[bins]]` entry, so the editor only handles one shape.
 */
export function parseDraft(toml: string): Draft {
  const table = parse(toml) as Record<string, unknown>;
  const { bin, population, bins, ...rest } = table as {
    bin?: Omit<Bin, "id" | "population">;
    population?: Population;
    bins?: Bin[];
  } & Record<string, unknown>;
  const normalized: Bin[] =
    bins ?? (bin && population ? [{ id: SINGLE_BIN_ID, ...bin, population }] : []);
  return structuredClone({ ...rest, bins: normalized }) as unknown as Draft;
}

/**
 * Writes the configuration back as TOML. One bin named `"bin"` at the origin
 * is written as `[bin]` + `[population]`, as the presets are; anything else as
 * `[[bins]]`.
 */
export function draftToToml(draft: Draft): string {
  const { bins, ...rest } = draft;
  const ordered: Record<string, unknown> = { run: rest.run, assets: rest.assets };
  const only = bins.length === 1 ? bins[0] : undefined;
  if (only && only.id === SINGLE_BIN_ID) {
    const { id: _id, population, ...bin } = only;
    ordered.bin = bin;
    ordered.population = population;
  } else {
    ordered.bins = bins;
  }
  Object.assign(ordered, {
    physics: rest.physics,
    cameras: rest.cameras,
    appearance: rest.appearance,
    renderers: rest.renderers,
    output: rest.output,
  });
  return emitDocument(ordered);
}

// Values under these keys are written as their own `[parent.key]` tables;
// every other nested table is written inline, as the presets do.
const SUBTABLES = new Set(["population", "wgpu", "blenderproc"]);

type TomlValue = string | number | boolean | TomlValue[] | { [key: string]: TomlValue };

function isTable(value: unknown): value is Record<string, TomlValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emitDocument(document: Record<string, unknown>): string {
  const blocks: string[] = [];
  for (const [key, value] of Object.entries(document)) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.every(isTable)) {
      for (const entry of value) blocks.push(emitTable(`[[${bareKey(key)}]]`, bareKey(key), entry));
    } else if (isTable(value)) {
      blocks.push(emitTable(`[${bareKey(key)}]`, bareKey(key), value));
    }
  }
  return blocks.join("\n\n") + "\n";
}

function emitTable(header: string, path: string, table: Record<string, TomlValue>): string {
  const lines = [header];
  const later: string[] = [];
  for (const [key, value] of Object.entries(table)) {
    if (value === undefined) continue;
    if (SUBTABLES.has(key) && isTable(value)) {
      later.push(emitTable(`[${path}.${bareKey(key)}]`, `${path}.${bareKey(key)}`, value));
    } else {
      lines.push(`${bareKey(key)} = ${emitValue(value)}`);
    }
  }
  return [lines.join("\n"), ...later].join("\n\n");
}

function emitValue(value: TomlValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`cannot write ${value} to TOML`);
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(emitValue).join(", ")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return `{ ${entries.map(([k, v]) => `${bareKey(k)} = ${emitValue(v)}`).join(", ")} }`;
}

function bareKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

/** Whole-percent shares per asset that sum to 100, from a bin's mixture. */
export function sharesFromMixture(mixture: AssetMixture, assetIds: string[]): Record<string, number> {
  if (mixture.kind === "fixed") {
    return Object.fromEntries(assetIds.map((id) => [id, id === mixture.value ? 100 : 0]));
  }
  const weights = Object.fromEntries(assetIds.map((id) => [id, 0]));
  for (const { value, weight } of mixture.values) {
    if (value in weights) weights[value] = (weights[value] ?? 0) + weight;
  }
  return toPercentages(weights, assetIds);
}

/** The mixture a set of shares describes: `fixed` for a single asset, else `choice`. */
export function mixtureFromShares(shares: Record<string, number>, assetIds: string[]): AssetMixture {
  const used = assetIds.filter((id) => (shares[id] ?? 0) > 0);
  if (used.length === 1) return { kind: "fixed", value: used[0]! };
  return {
    kind: "choice",
    values: used.map((id) => ({ value: id, weight: round((shares[id] ?? 0) / 100, 4) })),
  };
}

/** Scales weights to whole percentages summing to 100 (largest remainder). */
export function toPercentages(weights: Record<string, number>, ids: string[]): Record<string, number> {
  const total = ids.reduce((sum, id) => sum + Math.max(0, weights[id] ?? 0), 0);
  if (total <= 0) {
    return Object.fromEntries(ids.map((id, index) => [id, index === 0 ? 100 : 0]));
  }
  const exact = ids.map((id) => ({ id, value: (Math.max(0, weights[id] ?? 0) / total) * 100 }));
  const result = Object.fromEntries(exact.map(({ id, value }) => [id, Math.floor(value)]));
  let missing = 100 - Object.values(result).reduce((a, b) => a + b, 0);
  for (const { id } of [...exact].sort(
    (a, b) => (b.value % 1) - (a.value % 1) || a.id.localeCompare(b.id),
  )) {
    if (missing <= 0) break;
    result[id] = (result[id] ?? 0) + 1;
    missing -= 1;
  }
  return result;
}

/**
 * Shares over `ids` after `added` joins (with an equal slice) or an asset
 * leaves; the remaining assets keep their proportions.
 */
export function rebalance(
  shares: Record<string, number>,
  ids: string[],
  added: string | null,
): Record<string, number> {
  const rest = ids.filter((id) => id !== added);
  const fresh = added ? Math.round(100 / ids.length) : 0;
  const scaled = toPercentages(
    Object.fromEntries(rest.map((id) => [id, shares[id] ?? 0])),
    rest,
  );
  const weights: Record<string, number> = Object.fromEntries(
    rest.map((id) => [id, ((scaled[id] ?? 0) * (100 - fresh)) / 100]),
  );
  if (added) weights[added] = fresh;
  return toPercentages(weights, ids);
}

/** A spawn volume inside `bin`, with the margins the presets use. */
export function spawnVolumeFor(dimensions: [number, number, number]): Population["spawn_volume"] {
  const [w, d, h] = dimensions;
  const margin = 0.04;
  return {
    min_m: [round(-w / 2 + margin), round(-d / 2 + margin), 0.05],
    max_m: [round(w / 2 - margin), round(d / 2 - margin), round(Math.max(h - 0.02, 0.06))],
  };
}

/** A new `[[assets]]` entry for a library file, with conservative defaults. */
export function assetForLibraryPath(path: string, takenIds: string[]): Asset {
  const stem = path.split("/").pop()!.replace(/\.[^.]+$/, "");
  const base = stem.replace(/[^A-Za-z0-9_-]+/g, "_") || "asset";
  let id = base;
  for (let n = 2; takenIds.includes(id); n += 1) id = `${base}_${n}`;
  return {
    id,
    source_path: path,
    // STL has no units; millimetres are the common CAD export. GLB is metres.
    source_unit_scale_m: path.toLowerCase().endsWith(".stl") ? 0.001 : 1,
    model_transform: { translation: [0, 0, 0], rotation_xyzw: [0, 0, 0, 1] },
    mixture_weight: 1,
    physical_properties: {
      mass_kg: { kind: "fixed", value: 0.05 },
      friction: { kind: "uniform", min: 0.4, max: 0.7 },
      restitution: { kind: "fixed", value: 0.1 },
    },
    vhacd: {
      resolution: 20000,
      max_convex_hulls: 4,
      concavity: 0.0025,
      plane_downsampling: 4,
      convex_hull_downsampling: 4,
    },
  };
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
