import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  assetForLibraryPath,
  mixtureFromShares,
  parseDraft,
  rebalance,
  round,
  sharesFromMixture,
  spawnVolumeFor,
} from "../config/draft";
import {
  MATERIAL_PRESETS,
  type MaterialPreset,
  fromConfig,
  matchPreset,
  toBinMaterial,
  toPbr,
} from "../config/materials";
import { fixedPose } from "../config/pose";
import { PRESETS } from "../config/presets";
import type { Asset, Bin, Camera, Draft, Environment, Physics, Run, Vec3 } from "../config/types";

/** Which material a bin or asset uses; `null` keeps what the file says. */
export interface Assignments {
  bins: Record<string, string | null>;
  assets: Record<string, string | null>;
}

export interface Project {
  presetId: string;
  draft: Draft;
  dirty: boolean;
  scene: number;
  selectedBin: number;
  selectedCamera: number;
  selectedMaterial: string;
  materials: MaterialPreset[];
  assignments: Assignments;

  loadPreset: (id: string) => void;
  loadToml: (toml: string, name: string) => void;
  setScene: (scene: number) => void;
  setRun: (patch: Partial<Run>) => void;
  setPhysics: (patch: Partial<Physics>) => void;
  /** Sets the HDR environment lighting the scene; `null` returns to the ambient light. */
  setEnvironment: (environment: Environment | null) => void;

  selectBin: (index: number) => void;
  updateBin: (index: number, patch: Partial<Bin>) => void;
  addBin: () => void;
  removeBin: (index: number) => void;
  setObjectCount: (index: number, count: number) => void;
  setShares: (index: number, shares: Record<string, number>) => void;

  addAsset: (libraryPath: string) => void;
  removeAsset: (id: string) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;

  selectCamera: (index: number) => void;
  updateCamera: (index: number, patch: Partial<Camera>) => void;
  addCamera: () => void;
  removeCamera: (index: number) => void;

  selectMaterial: (id: string) => void;
  updateMaterial: (id: string, patch: Partial<MaterialPreset>) => void;
  assignBin: (binId: string, materialId: string) => void;
  assignAsset: (assetId: string, materialId: string) => void;
}

/** Centre of the bins' floors; fixed cameras look at it. */
export function sceneCentre(draft: Draft): Vec3 {
  if (draft.bins.length === 0) return [0, 0, 0];
  const xs = draft.bins.map((bin) => bin.world_from_bin.translation[0]);
  const ys = draft.bins.map((bin) => bin.world_from_bin.translation[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 0];
}

/** Infers assignments from a loaded file, adding a library entry for any unknown surface. */
function adopt(draft: Draft, library: MaterialPreset[]) {
  const materials = [...library];
  const assignments: Assignments = { bins: {}, assets: {} };
  const resolve = (label: string, material: Parameters<typeof matchPreset>[1]) => {
    if (!material) return null;
    const known = matchPreset(materials, material);
    if (known) return known.id;
    const id = `file-${label}`;
    materials.push(fromConfig(id, `From file: ${label}`, material));
    return id;
  };
  for (const bin of draft.bins) assignments.bins[bin.id] = resolve(bin.id, bin.render_material);
  for (const asset of draft.assets) assignments.assets[asset.id] = resolve(asset.id, asset.visual_override);
  return { materials, assignments };
}

function fresh(toml: string, presetId: string, library: MaterialPreset[]) {
  const draft = parseDraft(toml);
  const { materials, assignments } = adopt(draft, library);
  return {
    presetId,
    draft,
    dirty: false,
    scene: 0,
    selectedBin: 0,
    selectedCamera: 0,
    materials,
    assignments,
    selectedMaterial: assignments.bins[draft.bins[0]?.id ?? ""] ?? materials[0]!.id,
  };
}

const initial = PRESETS.find((preset) => preset.id === "medium")!;

export const useProject = create<Project>()(
  persist(
    (set, get) => {
      /** Applies `change` to a copy of the draft and marks it unsaved. */
      const edit = (change: (draft: Draft) => void) => {
        const draft = structuredClone(get().draft);
        change(draft);
        set({ draft, dirty: true });
      };
      const assetIds = () => get().draft.assets.map((asset) => asset.id);

      return {
        ...fresh(initial.toml, initial.id, MATERIAL_PRESETS),

        loadPreset: (id) => {
          const preset = PRESETS.find((p) => p.id === id);
          if (preset) set(fresh(preset.toml, preset.id, MATERIAL_PRESETS));
        },
        loadToml: (toml, name) => set({ ...fresh(toml, name, MATERIAL_PRESETS), dirty: true }),
        setScene: (scene) => set({ scene: Math.max(0, Math.min(scene, get().draft.run.valid_scene_count - 1)) }),
        setRun: (patch) => edit((draft) => Object.assign(draft.run, patch)),
        setPhysics: (patch) => edit((draft) => Object.assign(draft.physics, patch)),
        setEnvironment: (environment) =>
          edit((draft) => {
            if (environment) draft.appearance.environment = environment;
            else delete draft.appearance.environment;
          }),

        selectBin: (index) => set({ selectedBin: index }),
        updateBin: (index, patch) =>
          edit((draft) => {
            const bin = draft.bins[index];
            if (!bin) return;
            Object.assign(bin, patch);
            if (patch.inner_dimensions_m) bin.population.spawn_volume = spawnVolumeFor(bin.inner_dimensions_m);
          }),
        addBin: () => {
          const { draft } = get();
          const last = draft.bins[draft.bins.length - 1];
          if (!last) return;
          const taken = new Set(draft.bins.map((bin) => bin.id));
          let n = draft.bins.length + 1;
          while (taken.has(`bin_${n}`)) n += 1;
          const outer = last.inner_dimensions_m[0] + 2 * last.wall_thickness_m;
          const copy: Bin = structuredClone(last);
          copy.id = `bin_${n}`;
          copy.world_from_bin.translation[0] = round(last.world_from_bin.translation[0] + outer + 0.06);
          const assignment = get().assignments.bins[last.id] ?? null;
          edit((d) => d.bins.push(copy));
          set((s) => ({
            selectedBin: s.draft.bins.length - 1,
            assignments: { ...s.assignments, bins: { ...s.assignments.bins, [copy.id]: assignment } },
          }));
        },
        removeBin: (index) => {
          if (get().draft.bins.length <= 1) return;
          edit((draft) => draft.bins.splice(index, 1));
          set((s) => ({ selectedBin: Math.min(s.selectedBin, s.draft.bins.length - 1) }));
        },
        setObjectCount: (index, count) =>
          edit((draft) => {
            const bin = draft.bins[index];
            if (bin) bin.population.object_count = { kind: "fixed", value: Math.max(0, Math.round(count)) };
          }),
        setShares: (index, shares) =>
          edit((draft) => {
            const bin = draft.bins[index];
            if (bin) bin.population.asset_mixture = mixtureFromShares(shares, assetIds());
          }),

        addAsset: (libraryPath) => {
          const asset = assetForLibraryPath(libraryPath, assetIds());
          edit((draft) => {
            const ids = [...draft.assets.map((a) => a.id), asset.id];
            for (const bin of draft.bins) {
              const shares = sharesFromMixture(bin.population.asset_mixture, ids);
              bin.population.asset_mixture = mixtureFromShares(rebalance(shares, ids, asset.id), ids);
            }
            draft.assets.push(asset);
          });
          set((s) => ({ assignments: { ...s.assignments, assets: { ...s.assignments.assets, [asset.id]: null } } }));
        },
        removeAsset: (id) => {
          if (get().draft.assets.length <= 1) return;
          edit((draft) => {
            const before = draft.assets.map((a) => a.id);
            const ids = before.filter((other) => other !== id);
            for (const bin of draft.bins) {
              const shares = sharesFromMixture(bin.population.asset_mixture, before);
              bin.population.asset_mixture = mixtureFromShares(rebalance(shares, ids, null), ids);
            }
            draft.assets = draft.assets.filter((asset) => asset.id !== id);
          });
        },
        updateAsset: (id, patch) =>
          edit((draft) => {
            const asset = draft.assets.find((a) => a.id === id);
            if (asset) Object.assign(asset, patch);
          }),

        selectCamera: (index) => set({ selectedCamera: index }),
        updateCamera: (index, patch) =>
          edit((draft) => {
            const camera = draft.cameras[index];
            if (camera) Object.assign(camera, patch);
          }),
        addCamera: () => {
          const { draft } = get();
          const template = draft.cameras[draft.cameras.length - 1];
          const id = Math.max(0, ...draft.cameras.map((c) => c.id)) + 1;
          const camera: Camera = {
            id,
            image_size: template?.image_size ?? { width: 640, height: 480 },
            near_m: template?.near_m ?? 0.05,
            far_m: template?.far_m ?? 3,
            projection: { vertical_fov_deg: 50 },
            pose: { fixed_world_from_camera: fixedPose(sceneCentre(draft), 30, 60, 1.2) },
          };
          edit((d) => d.cameras.push(camera));
          set((s) => ({ selectedCamera: s.draft.cameras.length - 1 }));
        },
        removeCamera: (index) => {
          if (get().draft.cameras.length <= 1) return;
          edit((draft) => draft.cameras.splice(index, 1));
          set((s) => ({ selectedCamera: Math.min(s.selectedCamera, s.draft.cameras.length - 1) }));
        },

        selectMaterial: (id) => set({ selectedMaterial: id }),
        updateMaterial: (id, patch) => {
          const materials = get().materials.map((m) => (m.id === id ? { ...m, ...patch } : m));
          const material = materials.find((m) => m.id === id)!;
          const { assignments } = get();
          set({ materials });
          // Every bin and asset using the material follows the edit.
          edit((draft) => {
            for (const bin of draft.bins) {
              if (assignments.bins[bin.id] === id) bin.render_material = toBinMaterial(material);
            }
            for (const asset of draft.assets) {
              if (assignments.assets[asset.id] === id) asset.visual_override = toPbr(material);
            }
          });
        },
        assignBin: (binId, materialId) => {
          const material = get().materials.find((m) => m.id === materialId);
          if (!material) return;
          edit((draft) => {
            const bin = draft.bins.find((b) => b.id === binId);
            if (bin) bin.render_material = toBinMaterial(material);
          });
          set((s) => ({
            selectedMaterial: materialId,
            assignments: { ...s.assignments, bins: { ...s.assignments.bins, [binId]: materialId } },
          }));
        },
        assignAsset: (assetId, materialId) => {
          const material = get().materials.find((m) => m.id === materialId);
          if (!material) return;
          edit((draft) => {
            const asset = draft.assets.find((a) => a.id === assetId);
            if (asset) asset.visual_override = toPbr(material);
          });
          set((s) => ({
            selectedMaterial: materialId,
            assignments: { ...s.assignments, assets: { ...s.assignments.assets, [assetId]: materialId } },
          }));
        },
      };
    },
    {
      name: "bop-studio.project",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        presetId: s.presetId,
        draft: s.draft,
        dirty: s.dirty,
        materials: s.materials,
        assignments: s.assignments,
        selectedMaterial: s.selectedMaterial,
      }),
    },
  ),
);
