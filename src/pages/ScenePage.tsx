import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useCreateJob, useServerInfo, useValidation } from "../api/queries";
import { draftToToml } from "../config/draft";
import { PRESETS } from "../config/presets";
import { type Check, inView, previewChecks, threeCamera } from "../preview/checks";
import { placeScene, type Extent } from "../preview/placement";
import { sceneCentre, useProject } from "../state/project";
import { useRunGeometries } from "../three/assetGeometry";
import { assetColor, cameraPose, verticalFov, type ColorBy } from "../three/SceneContent";
import { Viewport } from "../three/Viewport";
import { Vector3 } from "three";
import { Seg, Select } from "../ui/controls";
import { ChevronLeft, ChevronRight, FileIcon, PlayIcon } from "../ui/icons";
import { StatusBar, TopBar } from "../ui/layout";
import { Dock } from "./scene/Dock";
import { LeftPanel } from "./scene/LeftPanel";
import { MaterialsPanel } from "./scene/MaterialsPanel";

export default function ScenePage() {
  const project = useProject();
  const { draft, scene, selectedBin, selectedCamera } = project;
  const toml = useMemo(() => draftToToml(draft), [draft]);
  const validation = useValidation(toml);
  const info = useServerInfo();
  const geometries = useRunGeometries(draft.assets);
  const extents = useMemo(
    () => Object.fromEntries(geometries.map((g) => [g.asset.id, g.extent])) as Record<string, Extent | undefined>,
    // Recompute only when a mesh or its transform changes.
    [geometries.map((g) => `${g.asset.id}:${g.extent?.min.join()}:${g.extent?.max.join()}`).join("|")],
  );
  const placed = useMemo(() => placeScene(draft, scene, extents), [draft, scene, extents]);
  const centre = sceneCentre(draft);
  const [colorBy, setColorBy] = useState<ColorBy>("asset");
  const [renderer, setRenderer] = useState("wgpu");
  const createJob = useCreateJob();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const views = useMemo(
    () => draft.cameras.map((camera) => ({ camera, view: threeCamera(camera, cameraPose(draft, camera, scene), verticalFov(camera)) })),
    [draft, scene],
  );
  const selectedView = views[selectedCamera] ?? views[0];
  const inFrame = selectedView
    ? placed.filter((p) => inView(selectedView.view, new Vector3().setFromMatrixPosition(p.matrix))).length
    : 0;

  const checks: Check[] = [];
  if (validation.data && !validation.data.ok) checks.push({ level: "error", text: validation.data.error });
  if (validation.data?.ok) {
    for (const path of validation.data.report.missing_assets) {
      checks.push({ level: "error", text: `Asset ${path} is not in the server's library. Upload it on the Assets page.` });
    }
  }
  if (validation.error) checks.push({ level: "warn", text: `The server could not check the configuration: ${validation.error.message}` });
  for (const g of geometries) {
    if (g.error && !g.error.includes("no such file")) checks.push({ level: "warn", text: `${g.asset.id}: ${g.error}` });
  }
  checks.push(...previewChecks(draft, scene, placed, extents, views));
  const blocking = checks.some((c) => c.level === "error") || !validation.data?.ok;
  if (checks.length === 0) checks.push({ level: "ok", text: `No issues in preview scene ${scene}. The server checks the full schema on Generate.` });

  // Both renderers are always listed; ones this server was built without are disabled.
  const available = info.data?.renderers ?? ["wgpu", "blenderproc"];
  const activeRenderer = available.includes(renderer) ? renderer : (available[0] ?? renderer);
  const preset = PRESETS.find((p) => p.id === project.presetId);
  const fileName = preset?.name ?? (project.presetId.endsWith(".toml") ? project.presetId : `${project.presetId}.toml`);

  const generate = () =>
    createJob.mutate(
      { config: toml, renderer: activeRenderer },
      { onSuccess: (job) => navigate(`/jobs/${job.id}`) },
    );

  return (
    <div className="app">
      <TopBar
        left={
          <>
            <Select
              label="Configuration"
              value={preset ? preset.id : "__file"}
              options={[
                ...PRESETS.map((p) => ({ value: p.id, label: p.name })),
                ...(preset ? [] : [{ value: "__file", label: fileName }]),
                { value: "__open", label: "Open .toml…" },
              ]}
              onChange={(id) => (id === "__open" ? fileInput.current?.click() : id !== "__file" && project.loadPreset(id))}
              style={{ width: 168 }}
            />
            <input
              ref={fileInput}
              type="file"
              accept=".toml"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) project.loadToml(await file.text(), file.name);
                event.target.value = "";
              }}
            />
            {project.dirty && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                <span className="dot" style={{ background: "var(--ink)" }} />
                Unsaved
              </span>
            )}
          </>
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="lbl" style={{ marginRight: 4 }}>
            Scene
          </span>
          <button type="button" className="ctl ibtn" aria-label="Previous scene" onClick={() => project.setScene(scene - 1)}>
            <ChevronLeft />
          </button>
          <span className="ctl val" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 76, padding: "0 10px", background: "transparent" }}>
            {scene} / {draft.run.valid_scene_count}
          </span>
          <button type="button" className="ctl ibtn" aria-label="Next scene" onClick={() => project.setScene(scene + 1)}>
            <ChevronRight />
          </button>
        </div>
        <Seg
          label="Renderer"
          options={["wgpu", "blenderproc"].map((r) => ({
            value: r,
            label: r === "blenderproc" ? "BlenderProc" : r,
            disabled: !available.includes(r),
            title: available.includes(r) ? undefined : `This server was built without ${r}; start bop-server with --features ${r}`,
          }))}
          value={activeRenderer}
          onChange={setRenderer}
        />
        <button type="button" className="ctl btn primary" disabled={blocking || createJob.isPending} onClick={generate} title={blocking ? "Resolve the errors under Checks first" : undefined}>
          <PlayIcon />
          {createJob.isPending ? "Submitting…" : `Generate ${draft.run.valid_scene_count} scenes`}
        </button>
      </TopBar>
      {createJob.error && (
        <div className="banner" role="alert" style={{ color: "var(--error)", borderColor: "#6a3530", background: "#1d1314" }}>
          <FileIcon size={13} /> {createJob.error.message}
        </div>
      )}

      <div className="cols">
        <LeftPanel />
        <main className="center">
          <Viewport
            draft={draft}
            placed={placed}
            geometries={geometries}
            scene={scene}
            selectedBin={selectedBin}
            selectedCamera={selectedCamera}
            centre={centre}
            colorBy={colorBy}
            onColorBy={setColorBy}
            inFrame={inFrame}
            legend={
              colorBy === "asset"
                ? draft.assets.map((a, i) => ({ label: a.id, color: assetColor(i) }))
                : draft.assets.map((a) => {
                    const id = project.assignments.assets[a.id];
                    const material = project.materials.find((m) => m.id === id);
                    const base = a.visual_override?.base_color_srgb ?? [0.7, 0.7, 0.72];
                    return {
                      label: a.id,
                      sub: material?.name ?? "file default",
                      color: `rgb(${base.slice(0, 3).map((c) => Math.round(c * 255)).join(",")})`,
                    };
                  })
            }
          />
          <Dock toml={toml} checks={checks} fileName={fileName} />
        </main>
        <MaterialsPanel />
      </div>
      <StatusBar
        items={[
          `${placed.length} objects in preview`,
          `${draft.bins.length} bin${draft.bins.length === 1 ? "" : "s"}`,
          `${draft.cameras.length} camera${draft.cameras.length === 1 ? "" : "s"}`,
        ]}
      />
    </div>
  );
}
