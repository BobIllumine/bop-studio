// The parts of the run configuration (contract/run-config.schema.json) the
// studio edits. Everything else in a loaded file is carried through as is.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Rgba = [number, number, number, number];

export interface Transform {
  translation: Vec3;
  rotation_xyzw: Quat;
}

export type Distribution<T = number> =
  | { kind: "fixed"; value: T }
  | { kind: "uniform"; min: T; max: T }
  | { kind: "choice"; values: { value: T; weight: number }[] };

export type AssetMixture =
  | { kind: "fixed"; value: string }
  | { kind: "choice"; values: { value: string; weight: number }[] };

export interface PbrMaterial {
  base_color_srgb: Rgba;
  metallic: Distribution;
  roughness: Distribution;
}

export interface BinRenderMaterial {
  base_color_srgb: Rgba;
  metallic: number;
  roughness: number;
}

export interface Asset {
  id: string;
  source_path: string;
  source_unit_scale_m: number;
  model_transform: Transform;
  mixture_weight: number;
  physical_properties: {
    mass_kg: Distribution;
    friction: Distribution;
    restitution: Distribution;
  };
  vhacd: {
    resolution: number;
    max_convex_hulls: number;
    concavity: number;
    plane_downsampling: number;
    convex_hull_downsampling: number;
  };
  visual_override?: PbrMaterial;
}

export interface Population {
  object_count: Distribution;
  asset_mixture: AssetMixture;
  spawn_volume: { min_m: Vec3; max_m: Vec3 };
}

/** A bin in `[[bins]]` form; a `[bin]` file becomes the single bin `"bin"`. */
export interface Bin {
  id: string;
  inner_dimensions_m: Vec3;
  floor_thickness_m: number;
  wall_thickness_m: number;
  world_from_bin: Transform;
  material_label: string;
  physical_properties: { friction: number; restitution: number };
  render_material?: BinRenderMaterial;
  population: Population;
}

export interface ShellPose {
  min_radius_m: number;
  max_radius_m: number;
  min_azimuth_deg: number;
  max_azimuth_deg: number;
  min_elevation_deg: number;
  max_elevation_deg: number;
  target_bin_m: Vec3;
}

export type CameraPose = { fixed_world_from_camera: Transform } | { shell: ShellPose };

export interface Camera {
  id: number;
  image_size: { width: number; height: number };
  near_m: number;
  far_m: number;
  projection: { vertical_fov_deg: number } | { opencv_k: number[] };
  pose: CameraPose;
}

export interface Run {
  master_seed: number;
  valid_scene_count: number;
  simulation_workers: number;
  renderer_workers: number;
  [key: string]: unknown;
}

export interface Physics {
  substeps: number;
  solver_iterations: number;
  max_steps: number;
  [key: string]: unknown;
}

/** A run configuration with its bins normalized to `bins`. */
export interface Draft {
  run: Run;
  assets: Asset[];
  bins: Bin[];
  physics: Physics;
  cameras: Camera[];
  appearance: Record<string, unknown>;
  renderers: Record<string, unknown>;
  output: Record<string, unknown>;
}

/** `[appearance] environment`: an equirectangular HDR map lighting the scene instead of the ambient light. */
export interface Environment {
  path: string;
  intensity?: number;
  rotation_deg?: number;
}
