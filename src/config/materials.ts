import type { BinRenderMaterial, Distribution, PbrMaterial, Rgba } from "./types";

/** A reusable surface: base colour plus metallic and roughness ranges. */
export interface MaterialPreset {
  id: string;
  name: string;
  /** sRGB, 0–1. */
  base: [number, number, number];
  metallic: [number, number];
  roughness: [number, number];
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "steel", name: "Brushed steel", base: [0.56, 0.57, 0.58], metallic: [0.9, 1], roughness: [0.35, 0.55] },
  { id: "alu", name: "Anodized alu", base: [0.74, 0.76, 0.8], metallic: [0.85, 1], roughness: [0.25, 0.45] },
  { id: "brass", name: "Brass", base: [0.78, 0.6, 0.32], metallic: [0.9, 1], roughness: [0.2, 0.4] },
  { id: "abs-white", name: "White ABS", base: [0.86, 0.86, 0.84], metallic: [0, 0], roughness: [0.4, 0.6] },
  { id: "abs-black", name: "Black ABS", base: [0.09, 0.09, 0.1], metallic: [0, 0], roughness: [0.3, 0.5] },
  { id: "pp-blue", name: "Blue tote PP", base: [0.12, 0.32, 0.62], metallic: [0, 0], roughness: [0.5, 0.7] },
  { id: "pp-grey", name: "Grey tote PP", base: [0.42, 0.44, 0.47], metallic: [0, 0], roughness: [0.55, 0.75] },
  { id: "rubber", name: "Rubber", base: [0.16, 0.16, 0.16], metallic: [0, 0], roughness: [0.85, 1] },
  { id: "cardboard", name: "Cardboard", base: [0.62, 0.47, 0.31], metallic: [0, 0], roughness: [0.8, 0.95] },
];

const mid = ([a, b]: [number, number]) => (a + b) / 2;
const rgba = (base: [number, number, number]): Rgba => [base[0], base[1], base[2], 1];

function distribution([min, max]: [number, number]): Distribution {
  return min === max ? { kind: "fixed", value: min } : { kind: "uniform", min, max };
}

/** `[[assets]] visual_override`: the ranges become per-object distributions. */
export function toPbr(material: MaterialPreset): PbrMaterial {
  return {
    base_color_srgb: rgba(material.base),
    metallic: distribution(material.metallic),
    roughness: distribution(material.roughness),
  };
}

/** `[bin] render_material`: one surface, so the ranges collapse to their midpoints. */
export function toBinMaterial(material: MaterialPreset): BinRenderMaterial {
  return { base_color_srgb: rgba(material.base), metallic: mid(material.metallic), roughness: mid(material.roughness) };
}

function range(value: Distribution | number): [number, number] {
  if (typeof value === "number") return [value, value];
  if (value.kind === "fixed") return [value.value, value.value];
  if (value.kind === "uniform") return [value.min, value.max];
  const values = value.values.map((v) => v.value);
  return [Math.min(...values), Math.max(...values)];
}

/** Reads a configured surface back as a preset-shaped value, for display. */
export function fromConfig(
  id: string,
  name: string,
  material: PbrMaterial | BinRenderMaterial,
): MaterialPreset {
  const [r, g, b] = material.base_color_srgb;
  return { id, name, base: [r, g, b], metallic: range(material.metallic), roughness: range(material.roughness) };
}

/** The preset a configured surface matches, if any. */
export function matchPreset(
  presets: MaterialPreset[],
  material: PbrMaterial | BinRenderMaterial | undefined,
): MaterialPreset | undefined {
  if (!material) return undefined;
  const value = fromConfig("", "", material);
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  return presets.find(
    (preset) =>
      preset.base.every((c, i) => close(c, value.base[i]!)) &&
      (("metallic" in material && typeof material.metallic === "number")
        ? close(mid(preset.metallic), value.metallic[0]) && close(mid(preset.roughness), value.roughness[0])
        : preset.metallic.every((v, i) => close(v, value.metallic[i]!)) &&
          preset.roughness.every((v, i) => close(v, value.roughness[i]!))),
  );
}

export function hexFromRgb([r, g, b]: [number, number, number]): string {
  const hex = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function rgbFromHex(hex: string): [number, number, number] {
  const value = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return [value(1), value(3), value(5)];
}
