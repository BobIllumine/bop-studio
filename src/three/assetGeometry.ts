import { useQueries, useQuery } from "@tanstack/react-query";
import { Box3, BufferGeometry, Matrix4, Mesh, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { encodePath, fetchBytes } from "../api/client";
import type { Asset } from "../config/types";
import type { Extent } from "../preview/placement";

/**
 * Parses STL or GLB bytes into one geometry in source units, with positions and
 * normals only, so every instance of an asset can share one draw call.
 */
export async function parseMesh(path: string, bytes: ArrayBuffer): Promise<BufferGeometry> {
  const lower = path.toLowerCase();
  if (lower.endsWith(".stl")) {
    const geometry = new STLLoader().parse(bytes);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    return geometry;
  }
  if (lower.endsWith(".glb") || lower.endsWith(".gltf")) {
    const gltf = await new GLTFLoader().parseAsync(bytes, "");
    gltf.scene.updateMatrixWorld(true);
    const parts: BufferGeometry[] = [];
    gltf.scene.traverse((node) => {
      if (!(node as Mesh).isMesh) return;
      const source = (node as Mesh).geometry;
      const part = new BufferGeometry();
      part.setAttribute("position", source.getAttribute("position").clone());
      if (source.index) part.setIndex(source.index.clone());
      const geometry = part.index ? part.toNonIndexed() : part;
      geometry.applyMatrix4(node.matrixWorld);
      geometry.computeVertexNormals();
      parts.push(geometry);
    });
    const merged = parts.length ? mergeGeometries(parts, false) : null;
    if (!merged) throw new Error(`${path} has no meshes`);
    return merged;
  }
  throw new Error(`${path}: only STL and GLB previews are supported`);
}

/** Library file key for a geometry query. */
const geometryKey = (path: string) => ["asset-geometry", path] as const;

const geometryQuery = (path: string) => ({
  queryKey: geometryKey(path),
  queryFn: async ({ signal }: { signal: AbortSignal }) =>
    parseMesh(path, await fetchBytes(`/api/v1/assets/${encodePath(path)}`, signal)),
  staleTime: Infinity,
  gcTime: 30 * 60_000,
  retry: false,
});

export function useAssetGeometry(path: string | undefined) {
  return useQuery({ ...geometryQuery(path ?? ""), enabled: Boolean(path) });
}

/** The matrix from an asset's source geometry to its model frame, in metres. */
export function modelMatrix(asset: Asset): Matrix4 {
  const s = asset.source_unit_scale_m;
  return new Matrix4()
    .compose(
      new Vector3(...asset.model_transform.translation),
      new Quaternion(...asset.model_transform.rotation_xyzw),
      new Vector3(1, 1, 1),
    )
    .multiply(new Matrix4().makeScale(s, s, s));
}

export function extentOf(geometry: BufferGeometry, asset: Asset): Extent {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = new Box3().copy(geometry.boundingBox!).applyMatrix4(modelMatrix(asset));
  return { min: box.min.toArray(), max: box.max.toArray() };
}

/** Geometry, extent and load state of every asset in the run. */
export function useRunGeometries(assets: Asset[]) {
  const results = useQueries({ queries: assets.map((asset) => geometryQuery(asset.source_path)) });
  return assets.map((asset, index) => {
    const result = results[index]!;
    const geometry = result.data;
    return {
      asset,
      geometry,
      extent: geometry ? extentOf(geometry, asset) : undefined,
      loading: result.isPending,
      error: result.error instanceof Error ? result.error.message : undefined,
    };
  });
}
