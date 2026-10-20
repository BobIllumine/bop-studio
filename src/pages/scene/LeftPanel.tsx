import { useState } from "react";

import { useLibrary } from "../../api/queries";
import { round, sharesFromMixture } from "../../config/draft";
import { fixedPose, fixedPoseAngles } from "../../config/pose";
import type { Camera, Environment, Vec3 } from "../../config/types";
import { sceneCentre, useProject } from "../../state/project";
import { assetColor } from "../../three/SceneContent";
import { ChipRow, NumberField, Section, Select, Seg } from "../../ui/controls";
import { ChevronDown } from "../../ui/icons";
import { MixBar, Slider } from "../../ui/Slider";

const m = (value: number) => `${value.toFixed(2)} m`;
const deg = (value: number) => `${Math.round(value)}°`;

export function LeftPanel() {
  return (
    <aside className="panel left" aria-label="Scene configuration">
      <RunSection />
      <BinsSection />
      <CamerasSection />
      <LightingSection />
      <PhysicsSection />
    </aside>
  );
}

const HDR = /\.(hdr|exr)$/i;

/** The environment map (any .hdr or .exr in the library) or the ambient light. */
function LightingSection() {
  const library = useLibrary();
  const environment = useProject((s) => s.draft.appearance.environment as Environment | undefined);
  const setEnvironment = useProject((s) => s.setEnvironment);
  const maps = (library.data ?? []).map((o) => o.path).filter((path) => HDR.test(path));
  const options = [...new Set([...(environment ? [environment.path] : []), ...maps])];
  return (
    <Section title="Lighting" tag="[appearance]">
      <div className="field">
        <label htmlFor="envmap" className="lbl">
          Environment map
        </label>
        <Select
          id="envmap"
          value={environment?.path ?? ""}
          options={[{ value: "", label: "None (ambient light)" }, ...options.map((path) => ({ value: path, label: path }))]}
          onChange={(path) => setEnvironment(path ? { path, intensity: environment?.intensity ?? 1, rotation_deg: environment?.rotation_deg ?? 0 } : null)}
        />
        {maps.length === 0 && !environment && <span className="lbl">Upload an .hdr or .exr on the Assets page to light the scene with it.</span>}
      </div>
      {environment && (
        <>
          <Slider
            label="Intensity"
            display={(environment.intensity ?? 1).toFixed(2)}
            values={[environment.intensity ?? 1]}
            min={0}
            max={4}
            step={0.05}
            onChange={([v]) => setEnvironment({ ...environment, intensity: v! })}
          />
          <Slider
            label="Rotation"
            display={deg(environment.rotation_deg ?? 0)}
            values={[environment.rotation_deg ?? 0]}
            min={-180}
            max={180}
            step={1}
            onChange={([v]) => setEnvironment({ ...environment, rotation_deg: v! })}
          />
        </>
      )}
    </Section>
  );
}

function RunSection() {
  const run = useProject((s) => s.draft.run);
  const setRun = useProject((s) => s.setRun);
  const fields = [
    { id: "seed", label: "Master seed", key: "master_seed", min: 0, max: 2 ** 53 - 1 },
    { id: "scenes", label: "Valid scenes", key: "valid_scene_count", min: 1, max: 1_000_000 },
    { id: "simw", label: "Sim workers", key: "simulation_workers", min: 1, max: 256 },
    { id: "renw", label: "Render workers", key: "renderer_workers", min: 1, max: 64 },
  ] as const;
  return (
    <Section title="Run" tag="[run]">
      <div className="grid2">
        {fields.map((f) => (
          <div key={f.id} className="field">
            <label htmlFor={f.id} className="lbl">
              {f.label}
            </label>
            <NumberField id={f.id} value={run[f.key]} min={f.min} max={f.max} onCommit={(v) => setRun({ [f.key]: v })} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function BinsSection() {
  const draft = useProject((s) => s.draft);
  const selected = useProject((s) => s.selectedBin);
  const { selectBin, updateBin, addBin, removeBin, setObjectCount, setShares, addAsset, removeAsset } = useProject();
  const library = useLibrary();
  const bin = draft.bins[selected] ?? draft.bins[0];
  if (!bin) return null;
  const index = draft.bins.indexOf(bin);
  const ids = draft.assets.map((a) => a.id);
  const shares = sharesFromMixture(bin.population.asset_mixture, ids);
  const count = bin.population.object_count;
  const total = count.kind === "fixed" ? count.value : count.kind === "uniform" ? count.max : 0;
  const [w, d, h] = bin.inner_dimensions_m;
  const [x, y] = bin.world_from_bin.translation;
  const setDims = (dims: Vec3) => updateBin(index, { inner_dimensions_m: dims.map((v) => round(v)) as Vec3 });
  const setPos = (pos: [number, number]) =>
    updateBin(index, {
      world_from_bin: { ...bin.world_from_bin, translation: [round(pos[0]), round(pos[1]), bin.world_from_bin.translation[2]] },
    });
  const used = new Set(draft.assets.map((a) => a.source_path));
  const available = (library.data ?? []).filter((o) => !used.has(o.path) && /\.(stl|glb|gltf|obj)$/i.test(o.path));

  return (
    <Section title="Bins" tag={draft.bins.length === 1 && bin.id === "bin" ? "[bin]" : "[[bins]]"}>
      <ChipRow
        label="Bins"
        items={draft.bins.map((b, i) => ({ key: i, label: b.id }))}
        selected={index}
        onSelect={selectBin}
        onRemove={removeBin}
        onAdd={addBin}
      />
      <Slider label="Inner width" display={m(w)} values={[w]} min={0.2} max={1.5} step={0.01} onChange={([v]) => setDims([v!, d, h])} />
      <Slider label="Inner depth" display={m(d)} values={[d]} min={0.2} max={1.2} step={0.01} onChange={([v]) => setDims([w, v!, h])} />
      <Slider label="Inner height" display={m(h)} values={[h]} min={0.1} max={1} step={0.01} onChange={([v]) => setDims([w, d, v!])} />
      <Slider label="Position X" display={m(x)} values={[x]} min={-2} max={2} step={0.01} onChange={([v]) => setPos([v!, y])} />
      <Slider label="Position Y" display={m(y)} values={[y]} min={-1.5} max={1.5} step={0.01} onChange={([v]) => setPos([x, v!])} />

      <div className="sub">
        <div className="row">
          <h3 className="sec-t" style={{ textTransform: "none", letterSpacing: 0, fontSize: 12, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
            Population <span className="tag">{bin.id}</span>
          </h3>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label htmlFor="popcount" className="lbl">
              Objects
            </label>
            <NumberField id="popcount" value={total} min={0} max={65_535} style={{ width: 76, textAlign: "right" }} onCommit={(v) => setObjectCount(index, v)} />
          </span>
        </div>
        <div className="field">
          <span className="lbl">Assets</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <ChipRow
              label="Assets in the run"
              items={draft.assets.map((a, i) => ({ key: a.id, label: a.id, color: assetColor(i) }))}
              onRemove={removeAsset}
            />
            {available.length > 0 && (
              <Select
                label="Add asset from library"
                value=""
                options={[{ value: "", label: "+ Add from library" }, ...available.map((o) => ({ value: o.path, label: o.path }))]}
                onChange={(path) => path && addAsset(path)}
                style={{ width: "auto" }}
              />
            )}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Asset mix</span>
          <MixBar
            shares={ids.map((id) => shares[id] ?? 0)}
            colors={ids.map((_, i) => assetColor(i))}
            names={ids}
            onChange={(next) => setShares(index, Object.fromEntries(ids.map((id, i) => [id, next[i]!])))}
          />
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {ids.map((id, i) => (
            <li key={id} style={{ display: "grid", gridTemplateColumns: "10px minmax(0, 1fr) 44px 52px", gap: 10, alignItems: "center" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: assetColor(i) }} />
              <span className="mono" style={{ fontSize: 12, color: "var(--text)" }}>
                {id}
              </span>
              <span className="val" style={{ textAlign: "right" }}>
                {shares[id] ?? 0}%
              </span>
              <span className="val muted" style={{ textAlign: "right" }}>
                ≈ {Math.round(((shares[id] ?? 0) / 100) * total)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

const RESOLUTIONS = ["256x256", "640x480", "1024x1024", "1280x720", "1920x1080"];

function CamerasSection() {
  const draft = useProject((s) => s.draft);
  const selected = useProject((s) => s.selectedCamera);
  const { selectCamera, updateCamera, addCamera, removeCamera } = useProject();
  const camera = draft.cameras[selected] ?? draft.cameras[0];
  if (!camera) return null;
  const index = draft.cameras.indexOf(camera);
  const centre = sceneCentre(draft);
  const update = (patch: Partial<Camera>) => updateCamera(index, patch);
  const resolution = `${camera.image_size.width}x${camera.image_size.height}`;
  const shell = "shell" in camera.pose ? camera.pose.shell : null;
  const fixed = "fixed_world_from_camera" in camera.pose ? camera.pose.fixed_world_from_camera : null;
  const angles = fixed ? fixedPoseAngles(fixed, centre) : null;
  const setFixed = (az: number, el: number, r: number) => update({ pose: { fixed_world_from_camera: fixedPose(centre, az, el, r) } });
  const setShell = (patch: Partial<NonNullable<typeof shell>>) => shell && update({ pose: { shell: { ...shell, ...patch } } });
  const fov = "vertical_fov_deg" in camera.projection ? camera.projection.vertical_fov_deg : null;

  return (
    <Section title="Cameras" tag="[[cameras]]">
      <ChipRow
        label="Cameras"
        items={draft.cameras.map((c, i) => ({ key: i, label: `cam ${c.id}` }))}
        selected={index}
        onSelect={selectCamera}
        onRemove={removeCamera}
        onAdd={addCamera}
      />
      <div className="grid2">
        <div className="field">
          <span className="lbl">Pose</span>
          <Seg
            label="Pose"
            full
            options={[
              { value: "fixed", label: "Fixed" },
              { value: "shell", label: "Shell" },
            ]}
            value={shell ? "shell" : "fixed"}
            onChange={(mode) => {
              if (mode === "shell" && !shell) {
                const a = angles ?? { azimuthDeg: 0, elevationDeg: 65, radius: 0.9 };
                const bin = draft.bins[0]?.world_from_bin.translation ?? [0, 0, 0];
                update({
                  pose: {
                    shell: {
                      min_radius_m: round(a.radius * 0.9),
                      max_radius_m: round(a.radius * 1.1),
                      min_azimuth_deg: Math.round(a.azimuthDeg - 20),
                      max_azimuth_deg: Math.round(a.azimuthDeg + 20),
                      min_elevation_deg: Math.round(Math.min(a.elevationDeg, 80) - 10),
                      max_elevation_deg: Math.round(Math.min(a.elevationDeg, 80)),
                      target_bin_m: [round(centre[0] - bin[0]), round(centre[1] - bin[1]), 0.05],
                    },
                  },
                });
              } else if (mode === "fixed" && shell) {
                setFixed((shell.min_azimuth_deg + shell.max_azimuth_deg) / 2, (shell.min_elevation_deg + shell.max_elevation_deg) / 2, (shell.min_radius_m + shell.max_radius_m) / 2);
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="camres" className="lbl">
            Image size
          </label>
          <Select
            id="camres"
            value={resolution}
            options={[...new Set([resolution, ...RESOLUTIONS])].map((r) => ({ value: r, label: r.replace("x", " × ") }))}
            onChange={(r) => {
              const [width, height] = r.split("x").map(Number);
              update({ image_size: { width: width!, height: height! } });
            }}
          />
        </div>
      </div>
      {angles && (
        <>
          <Slider label="Azimuth" display={deg(angles.azimuthDeg)} values={[round(angles.azimuthDeg, 0)]} min={-180} max={180} step={1} onChange={([v]) => setFixed(v!, angles.elevationDeg, angles.radius)} />
          <Slider label="Elevation" display={deg(angles.elevationDeg)} values={[round(angles.elevationDeg, 0)]} min={5} max={90} step={1} onChange={([v]) => setFixed(angles.azimuthDeg, v!, angles.radius)} />
          <Slider label="Distance" display={m(angles.radius)} values={[round(angles.radius, 2)]} min={0.3} max={4} step={0.01} onChange={([v]) => setFixed(angles.azimuthDeg, angles.elevationDeg, v!)} />
        </>
      )}
      {shell && (
        <>
          <Slider label="Azimuth" display={`${deg(shell.min_azimuth_deg)} – ${deg(shell.max_azimuth_deg)}`} values={[shell.min_azimuth_deg, shell.max_azimuth_deg]} min={-180} max={360} step={1} onChange={([a, b]) => setShell({ min_azimuth_deg: a!, max_azimuth_deg: b! })} />
          <Slider label="Elevation" display={`${deg(shell.min_elevation_deg)} – ${deg(shell.max_elevation_deg)}`} values={[shell.min_elevation_deg, shell.max_elevation_deg]} min={5} max={90} step={1} onChange={([a, b]) => setShell({ min_elevation_deg: a!, max_elevation_deg: b! })} />
          <Slider label="Radius" display={`${m(shell.min_radius_m)} – ${m(shell.max_radius_m)}`} values={[shell.min_radius_m, shell.max_radius_m]} min={0.3} max={4} step={0.01} onChange={([a, b]) => setShell({ min_radius_m: a!, max_radius_m: b! })} />
        </>
      )}
      {fov !== null && (
        <Slider label="Vertical FOV" display={deg(fov)} values={[fov]} min={15} max={100} step={1} onChange={([v]) => update({ projection: { vertical_fov_deg: v! } })} />
      )}
    </Section>
  );
}

function PhysicsSection() {
  const physics = useProject((s) => s.draft.physics);
  const setPhysics = useProject((s) => s.setPhysics);
  const [open, setOpen] = useState(false);
  return (
    <section className="sec">
      <button type="button" className="sec-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sec-t">Physics</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="sec-k">[physics]</span>
          <ChevronDown size={12} style={{ color: "var(--subtle)", transform: open ? "rotate(180deg)" : undefined }} />
        </span>
      </button>
      {open && (
        <>
          <Slider label="Substeps" display={physics.substeps} values={[physics.substeps]} min={1} max={8} step={1} onChange={([v]) => setPhysics({ substeps: v! })} />
          <Slider label="Solver iterations" display={physics.solver_iterations} values={[physics.solver_iterations]} min={1} max={32} step={1} onChange={([v]) => setPhysics({ solver_iterations: v! })} />
          <Slider label="Max steps" display={physics.max_steps} values={[physics.max_steps]} min={200} max={10_000} step={100} onChange={([v]) => setPhysics({ max_steps: v! })} />
        </>
      )}
    </section>
  );
}
