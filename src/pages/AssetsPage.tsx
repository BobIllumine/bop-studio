import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { Box3, Color, Mesh, Sphere, type BufferGeometry } from "three";

import { type StoredObject, uploadAsset } from "../api/client";
import { useDeleteAsset, useLibrary, useOptimizeAsset } from "../api/queries";
import type { Asset, Distribution } from "../config/types";
import { useProject } from "../state/project";
import { useAssetGeometry } from "../three/assetGeometry";
import { RoomLighting, assetColor } from "../three/SceneContent";
import { thumbnail } from "../three/thumbnails";
import { NumberField, Parts, Section, Seg, Select } from "../ui/controls";
import { CubeIcon, SearchIcon, UploadIcon } from "../ui/icons";
import { StatusBar, TopBar } from "../ui/layout";
import { Slider } from "../ui/Slider";

const PREVIEWABLE = /\.(stl|glb|gltf)$/i;

function size(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const format = (path: string) => path.split(".").pop()?.toUpperCase() ?? "";
const ENVIRONMENT_MAP = /\.(hdr|exr)$/i;

interface Upload {
  path: string;
  progress: number;
  error?: string;
}

export default function AssetsPage() {
  const library = useLibrary();
  const draft = useProject((s) => s.draft);
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "stl" | "glb" | "scene">("all");
  const [query, setQuery] = useState("");
  const [over, setOver] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const objects = (library.data ?? []).filter((o) => !o.path.startsWith("."));
  const inRun = (path: string) => draft.assets.find((a) => a.source_path === path);
  const shown = objects.filter((o) => {
    if (query && !o.path.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "stl") return /\.stl$/i.test(o.path);
    if (filter === "glb") return /\.(glb|gltf)$/i.test(o.path);
    if (filter === "scene") return Boolean(inRun(o.path));
    return true;
  });
  const current = objects.find((o) => o.path === selected) ?? shown[0];

  const upload = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const path = file.name.replace(/[^A-Za-z0-9._/-]+/g, "_").replace(/^\.+/, "");
      setUploads((list) => [...list.filter((u) => u.path !== path), { path, progress: 0 }]);
      uploadAsset(path, file, (progress) =>
        setUploads((list) => list.map((u) => (u.path === path ? { ...u, progress } : u))),
      )
        .then(() => {
          setUploads((list) => list.filter((u) => u.path !== path));
          client.invalidateQueries({ queryKey: ["assets"] });
          client.removeQueries({ queryKey: ["asset-geometry", path] });
          setSelected(path);
        })
        .catch((error: Error) =>
          setUploads((list) => list.map((u) => (u.path === path ? { ...u, error: error.message } : u))),
        );
    }
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    if (event.dataTransfer.files.length) upload(event.dataTransfer.files);
  };
  const total = objects.reduce((sum, o) => sum + o.size, 0);

  return (
    <div className="app">
      <TopBar>
        <button type="button" className="ctl btn primary" onClick={() => input.current?.click()}>
          <UploadIcon size={13} />
          Import files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".stl,.glb,.gltf,.obj,.hdr,.exr"
          hidden
          onChange={(event) => {
            if (event.target.files) upload(event.target.files);
            event.target.value = "";
          }}
        />
      </TopBar>
      <div className="cols">
        <main className="main-scroll" style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>Asset library</h1>
              <span className="val muted">{objects.length} files</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <label className="ctl" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "0 10px", width: 220 }}>
                <SearchIcon size={13} style={{ color: "var(--subtle)" }} />
                <input
                  type="search"
                  aria-label="Search assets"
                  placeholder="Search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  style={{ flex: "1 1 auto", minWidth: 0, height: 30, border: 0, background: "transparent", outline: "none", fontSize: 12 }}
                />
              </label>
              <Seg
                label="Filter"
                options={[
                  { value: "all", label: "All" },
                  { value: "stl", label: "STL" },
                  { value: "glb", label: "GLB" },
                  { value: "scene", label: "In scene" },
                ]}
                value={filter}
                onChange={setFilter}
              />
            </div>
          </div>

          <div
            className={over ? "drop over" : "drop"}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CubeIcon size={22} style={{ color: "var(--subtle)" }} />
              <span>
                Drop <span className="mono">.stl</span> or <span className="mono">.glb</span> meshes, or <span className="mono">.hdr</span>/<span className="mono">.exr</span> environment maps, here
              </span>
            </div>
            <button type="button" className="ctl btn" onClick={() => input.current?.click()}>
              Choose files
            </button>
          </div>

          {library.error && <div className="notice error">{library.error.message}</div>}
          <div className="tiles">
            {uploads.map((u) => (
              <div key={u.path} className="tile" style={{ cursor: "default" }}>
                <div className="tile-img">
                  <CubeIcon size={36} style={{ color: "#4a505a" }} />
                </div>
                <div className="tile-body" style={{ gap: 8 }}>
                  <div className="row">
                    <span className="mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.path}
                    </span>
                    <span className="val muted">{u.error ? "failed" : `${Math.round(u.progress * 100)}%`}</span>
                  </div>
                  {u.error ? (
                    <span style={{ fontSize: 12, color: "var(--error)" }}>{u.error}</span>
                  ) : (
                    <div className="progress" role="progressbar" aria-label={`Uploading ${u.path}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(u.progress * 100)}>
                      <span style={{ width: `${u.progress * 100}%` }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {shown.map((o) => {
              // Same colour as in the Scene preview; assets outside the run are neutral.
              const runIndex = draft.assets.findIndex((a) => a.source_path === o.path);
              return (
                <Tile
                  key={o.path}
                  object={o}
                  color={runIndex >= 0 ? assetColor(runIndex) : "#9AA3AD"}
                  inRun={runIndex >= 0}
                  selected={o.path === current?.path}
                  onSelect={() => setSelected(o.path)}
                />
              );
            })}
          </div>
          {!library.isPending && objects.length === 0 && uploads.length === 0 && (
            <div className="empty">The library is empty.</div>
          )}
        </main>
        {current && (
          <Detail key={current.path} object={current} asset={inRun(current.path)} onDeleted={() => setSelected(null)} onSelect={setSelected} />
        )}
      </div>
      <StatusBar items={["assets/", `${objects.length} files`, size(total)]} />
    </div>
  );
}

function Tile({ object, color, inRun, selected, onSelect }: { object: StoredObject; color: string; inRun: boolean; selected: boolean; onSelect: () => void }) {
  const previewable = PREVIEWABLE.test(object.path);
  const geometry = useAssetGeometry(previewable ? object.path : undefined);
  const image = useMemo(() => (geometry.data ? thumbnail(geometry.data, color) : null), [geometry.data, color]);
  return (
    <button type="button" className="tile" aria-pressed={selected} onClick={onSelect}>
      <span className="tile-img">
        {image ? <img src={image} alt="" /> : <CubeIcon size={36} style={{ color: "#4a505a" }} />}
      </span>
      <span className="tile-body">
        <span className="row">
          <span className="mono" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {object.path}
          </span>
          {inRun && <span className="tag ok">IN SCENE</span>}
        </span>
        <Parts className="mono" style={{ fontSize: 11, color: "var(--subtle)" }} items={[format(object.path), size(object.size)]} />
      </span>
    </button>
  );
}

function MeshPreview({ geometry }: { geometry: BufferGeometry }) {
  const radius = useMemo(() => {
    const sphere = new Box3().setFromObject(new Mesh(geometry)).getBoundingSphere(new Sphere());
    geometry.center();
    return sphere.radius || 1;
  }, [geometry]);
  return (
    <Canvas camera={{ position: [radius * 2.2, -radius * 3, radius * 1.8], up: [0, 0, 1], fov: 30, near: radius / 100, far: radius * 100 }} dpr={[1, 2]} style={{ height: 220, background: "radial-gradient(circle at 50% 40%, #1e2227, #0b0c0e 70%)" }}>
      <RoomLighting intensity={0.8} />
      <directionalLight position={[-2, -3, 5]} intensity={1.5} />
      <mesh geometry={geometry}>
        <meshStandardMaterial color={new Color("#9AA3AD")} roughness={0.5} />
      </mesh>
      <OrbitControls makeDefault enablePan={false} />
    </Canvas>
  );
}

const range = (d: Distribution): [number, number] =>
  d.kind === "fixed" ? [d.value, d.value] : d.kind === "uniform" ? [d.min, d.max] : [Math.min(...d.values.map((v) => v.value)), Math.max(...d.values.map((v) => v.value))];
const fromRange = ([a, b]: [number, number]): Distribution => (a === b ? { kind: "fixed", value: a } : { kind: "uniform", min: a, max: b });
const fixedValue = (d: Distribution) => (d.kind === "fixed" ? d.value : range(d)[1]);

const OPTIMIZABLE = /\.(stl|glb)$/i;
const OPTIMIZED = /\.optimized\.glb$/i;

const DEVIATIONS = [
  { value: "0", label: "Weld only (exact)" },
  { value: "0.05", label: "0.05 mm" },
  { value: "0.1", label: "0.1 mm" },
  { value: "0.25", label: "0.25 mm" },
  { value: "0.5", label: "0.5 mm" },
  { value: "1", label: "1 mm" },
];

const UNITS = [
  { value: "1", label: "Metres" },
  { value: "0.01", label: "Centimetres" },
  { value: "0.001", label: "Millimetres" },
  { value: "0.0254", label: "Inches" },
];

/** Writes a welded, simplified GLB next to the file and offers to use it. */
function OptimizePanel({ object, asset, onSelect }: { object: StoredObject; asset: Asset | undefined; onSelect: (path: string) => void }) {
  const optimize = useOptimizeAsset();
  const updateAsset = useProject((s) => s.updateAsset);
  const [deviation, setDeviation] = useState("0.1");
  // STL has no units: use the scene's setting, else assume millimetres as Add to scene does.
  const [units, setUnits] = useState(String(asset?.source_unit_scale_m ?? 0.001));
  const stl = /\.stl$/i.test(object.path);
  const report = optimize.data;
  const pct = (after: number, before: number) => `${Math.round((1 - after / before) * 100)}% smaller`;

  return (
    <Section title="Optimize" tag="weld + simplify">
      <span className="lbl" style={{ lineHeight: 1.5 }}>
        Writes <span className="mono">{object.path.replace(/\.(stl|glb)$/i, ".optimized.glb")}</span>, merging duplicate vertices and removing
        triangles while the surface stays within the allowed deviation. At 640×480 a 10 cm part covers about 1 mm per pixel.
      </span>
      <div className="grid2">
        <div className="field">
          <label htmlFor="deviation" className="lbl">
            Max deviation
          </label>
          <Select id="deviation" value={deviation} options={DEVIATIONS} onChange={(value) => { setDeviation(value); optimize.reset(); }} />
        </div>
        {stl && !asset && (
          <div className="field">
            <label htmlFor="opt-units" className="lbl">
              Source units
            </label>
            <Select id="opt-units" value={units} options={UNITS} onChange={(value) => { setUnits(value); optimize.reset(); }} />
          </div>
        )}
      </div>
      <div>
        <button
          type="button"
          className="ctl btn primary"
          disabled={optimize.isPending}
          onClick={() =>
            optimize.mutate({
              path: object.path,
              max_deviation_mm: Number(deviation),
              ...(stl ? { source_unit_scale_m: Number(asset?.source_unit_scale_m ?? units) } : {}),
            })
          }
        >
          {optimize.isPending ? "Optimizing…" : "Optimize"}
        </button>
      </div>
      {optimize.error && <div className="notice error">{optimize.error.message}</div>}
      {report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel)" }}>
          <span className="mono" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
            {report.path}
          </span>
          <dl className="kv">
            <dt>File size</dt>
            <dd>
              {size(report.source_bytes)} → {size(report.bytes)} <span className="muted">({pct(report.bytes, report.source_bytes)})</span>
            </dd>
            <dt>Triangles</dt>
            <dd>
              {report.source_triangles.toLocaleString()} → {report.triangles.toLocaleString()}
            </dd>
            <dt>Vertices</dt>
            <dd>
              {report.source_vertices.toLocaleString()} → {report.vertices.toLocaleString()}
            </dd>
            <dt>Max deviation</dt>
            <dd>{report.max_deviation_mm.toFixed(3)} mm, measured</dd>
          </dl>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ctl btn" onClick={() => onSelect(report.path)}>
              Show
            </button>
            {asset && (
              <button
                type="button"
                className="ctl btn primary"
                title={`Point ${asset.id} at the optimized file (in metres)`}
                onClick={() => {
                  updateAsset(asset.id, { source_path: report.path, source_unit_scale_m: 1 });
                  onSelect(report.path);
                }}
              >
                Use in scene
              </button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function Detail({
  object,
  asset,
  onDeleted,
  onSelect,
}: {
  object: StoredObject;
  asset: Asset | undefined;
  onDeleted: () => void;
  onSelect: (path: string) => void;
}) {
  const previewable = PREVIEWABLE.test(object.path);
  const geometry = useAssetGeometry(previewable ? object.path : undefined);
  const { addAsset, removeAsset, updateAsset } = useProject();
  const remove = useDeleteAsset();
  const replace = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  // The preview recentres its own copy, never the shared geometry.
  const previewGeometry = useMemo(() => geometry.data?.clone(), [geometry.data]);
  const triangles = geometry.data ? geometry.data.getAttribute("position").count / 3 : null;
  const physics = asset?.physical_properties;
  const update = (patch: Partial<Asset>) => asset && updateAsset(asset.id, patch);

  return (
    <aside className="panel right wide" aria-label="Asset details">
      <div style={{ borderBottom: "1px solid var(--line)" }}>
        {previewGeometry ? (
          <MeshPreview geometry={previewGeometry} />
        ) : (
          <div className="tile-img" style={{ height: 220 }}>
            {geometry.error ? <span className="muted">{geometry.error.message}</span> : <CubeIcon size={40} style={{ color: "#4a505a" }} />}
          </div>
        )}
      </div>
      <Section title={asset ? asset.id : "Not in scene"} tag={asset ? <span className="tag ok">IN SCENE</span> : undefined}>
        <dl className="kv">
          <dt>Path</dt>
          <dd>{object.path}</dd>
          <dt>Format</dt>
          <dd>{format(object.path)}</dd>
          <dt>Material</dt>
          <dd>{ENVIRONMENT_MAP.test(object.path) ? "Does not apply" : /\.stl$/i.test(object.path) ? "None" : "Metallic-roughness"}</dd>
          <dt>File size</dt>
          <dd>{size(object.size)}</dd>
          {triangles !== null && (
            <>
              <dt>Triangles</dt>
              <dd>{triangles.toLocaleString()}</dd>
            </>
          )}
        </dl>
        {ENVIRONMENT_MAP.test(object.path) && (
          <p className="lbl" role="note" style={{ lineHeight: 1.5, margin: "8px 0 0" }}>
            Environment maps only light the scene. Materials apply to meshes and bins, not to environment maps.
          </p>
        )}
        {asset && (
          <div className="field">
            <label htmlFor="unit" className="lbl">
              Source units
            </label>
            <Select
              id="unit"
              value={String(asset.source_unit_scale_m)}
              options={[
                { value: "1", label: "Metres" },
                { value: "0.01", label: "Centimetres" },
                { value: "0.001", label: "Millimetres" },
                { value: "0.0254", label: "Inches" },
                ...(["1", "0.01", "0.001", "0.0254"].includes(String(asset.source_unit_scale_m))
                  ? []
                  : [{ value: String(asset.source_unit_scale_m), label: `× ${asset.source_unit_scale_m}` }]),
              ]}
              onChange={(v) => update({ source_unit_scale_m: Number(v) })}
            />
          </div>
        )}
      </Section>

      {OPTIMIZABLE.test(object.path) && !OPTIMIZED.test(object.path) && <OptimizePanel object={object} asset={asset} onSelect={onSelect} />}

      {asset && physics && (
        <>
          <Section title="Physics">
            <div className="field">
              <label htmlFor="mass" className="lbl">
                Mass (kg)
              </label>
              <NumberField
                id="mass"
                integer={false}
                step={0.001}
                min={0.0001}
                value={fixedValue(physics.mass_kg)}
                onCommit={(v) => update({ physical_properties: { ...physics, mass_kg: { kind: "fixed", value: v } } })}
              />
            </div>
            <Slider
              label="Friction"
              display={range(physics.friction).map((v) => v.toFixed(2)).join(" – ")}
              values={range(physics.friction)}
              min={0}
              max={1.5}
              step={0.01}
              onChange={([a, b]) => update({ physical_properties: { ...physics, friction: fromRange([a!, b!]) } })}
            />
            <Slider
              label="Restitution"
              display={fixedValue(physics.restitution).toFixed(2)}
              values={[fixedValue(physics.restitution)]}
              min={0}
              max={1}
              step={0.01}
              onChange={([v]) => update({ physical_properties: { ...physics, restitution: { kind: "fixed", value: v! } } })}
            />
          </Section>
          <Section title="Collision" tag="vhacd">
            <div className="grid2">
              <div className="field">
                <label htmlFor="res" className="lbl">
                  Resolution
                </label>
                <NumberField id="res" min={1000} step={1000} value={asset.vhacd.resolution} onCommit={(v) => update({ vhacd: { ...asset.vhacd, resolution: v } })} />
              </div>
              <div className="field">
                <label htmlFor="hulls" className="lbl">
                  Max convex hulls
                </label>
                <NumberField id="hulls" min={1} max={64} value={asset.vhacd.max_convex_hulls} onCommit={(v) => update({ vhacd: { ...asset.vhacd, max_convex_hulls: v } })} />
              </div>
            </div>
          </Section>
        </>
      )}

      <section className="sec">
        {asset ? (
          <button type="button" className="ctl btn" onClick={() => removeAsset(asset.id)}>
            Remove from scene
          </button>
        ) : (
          <button type="button" className="ctl btn primary" disabled={!previewable} onClick={() => addAsset(object.path)}>
            Add to scene
          </button>
        )}
        <div className="grid2" style={{ gap: 8 }}>
          <button type="button" className="ctl btn" onClick={() => replace.current?.click()}>
            Replace file
          </button>
          <button
            type="button"
            className="ctl btn danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Delete ${object.path} from the server's library?`)) {
                remove.mutate(object.path, { onSuccess: onDeleted });
              }
            }}
          >
            Delete
          </button>
        </div>
        <input
          ref={replace}
          type="file"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            await uploadAsset(object.path, file, () => {});
            client.invalidateQueries({ queryKey: ["assets"] });
            client.removeQueries({ queryKey: ["asset-geometry", object.path] });
          }}
        />
        {remove.error && <div className="notice error">{remove.error.message}</div>}
      </section>
    </aside>
  );
}
