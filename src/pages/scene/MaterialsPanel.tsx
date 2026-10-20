import { Canvas } from "@react-three/fiber";
import { SRGBColorSpace, Color } from "three";

import { hexFromRgb, rgbFromHex, type MaterialPreset } from "../../config/materials";
import { useProject } from "../../state/project";
import { RoomLighting } from "../../three/SceneContent";
import { Section, Select, Swatch } from "../../ui/controls";
import { BinIcon } from "../../ui/icons";
import { Slider } from "../../ui/Slider";

const mid = ([a, b]: [number, number]) => (a + b) / 2;
const range = ([a, b]: [number, number]) => (a === b ? a.toFixed(2) : `${a.toFixed(2)} – ${b.toFixed(2)}`);

/** Real PBR preview of one material: a sphere and a cube under the studio light. */
function MaterialPreview({ material }: { material: MaterialPreset }) {
  const color = new Color().setRGB(...material.base, SRGBColorSpace);
  const surface = <meshStandardMaterial color={color} metalness={mid(material.metallic)} roughness={mid(material.roughness)} />;
  return (
    <Canvas camera={{ position: [0, -3.4, 1.1], up: [0, 0, 1], fov: 30 }} dpr={[1, 2]} style={{ height: 184, background: "radial-gradient(circle at 50% 32%, #22262c, #0a0b0d 75%)" }}>
      <RoomLighting intensity={0.9} />
      <directionalLight position={[-2, -3, 4]} intensity={1.4} />
      <mesh position={[-0.42, 0, 0.1]}>
        <sphereGeometry args={[0.55, 64, 32]} />
        {surface}
      </mesh>
      <mesh position={[0.72, 0.2, -0.13]} rotation={[0, 0, Math.PI / 5]}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        {surface}
      </mesh>
    </Canvas>
  );
}

export function MaterialsPanel() {
  const draft = useProject((s) => s.draft);
  const materials = useProject((s) => s.materials);
  const assignments = useProject((s) => s.assignments);
  const selectedId = useProject((s) => s.selectedMaterial);
  const { selectMaterial, updateMaterial, assignBin, assignAsset } = useProject();
  const material = materials.find((m) => m.id === selectedId) ?? materials[0]!;
  const users = [
    ...draft.bins.filter((b) => assignments.bins[b.id] === material.id).map((b) => ({ label: b.id, bin: true })),
    ...draft.assets.filter((a) => assignments.assets[a.id] === material.id).map((a) => ({ label: a.id, bin: false })),
  ];
  const samples = [
    [0, 0],
    [0, 1],
    [0.5, 0.5],
    [1, 0],
    [1, 1],
  ].map(([mt, ro]) => ({
    metallic: material.metallic[0] + (material.metallic[1] - material.metallic[0]) * mt!,
    roughness: material.roughness[0] + (material.roughness[1] - material.roughness[0]) * ro!,
  }));
  const options = materials.map((m) => ({ value: m.id, label: m.name }));

  return (
    <aside className="panel right" aria-label="Materials">
      <section className="sec" style={{ padding: 0, gap: 0 }}>
        <div style={{ borderBottom: "1px solid var(--line)" }}>
          <MaterialPreview material={material} />
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{material.name}</h2>
              <div className="tags" style={{ marginTop: 8 }}>
                <span className="tag strong">{mid(material.metallic) > 0.5 ? "Metal" : "Dielectric"}</span>
                {users.length === 0 && <span className="tag">unused</span>}
                {users.map((u) => (
                  <span key={`${u.bin}-${u.label}`} className="tag">
                    {u.bin && <BinIcon size={12} role="img" aria-label="Bin" aria-hidden={undefined} />}
                    {u.label}
                  </span>
                ))}
              </div>
            </div>
            <label className="ctl colorctl">
              <span className="val">{hexFromRgb(material.base)}</span>
              <input
                type="color"
                aria-label="Base colour"
                value={hexFromRgb(material.base)}
                onChange={(event) => updateMaterial(material.id, { base: rgbFromHex(event.target.value) })}
              />
            </label>
          </div>
          <Slider label="Metallic" display={range(material.metallic)} values={material.metallic} min={0} max={1} step={0.01} onChange={([a, b]) => updateMaterial(material.id, { metallic: [a!, b!] })} />
          <Slider label="Roughness" display={range(material.roughness)} values={material.roughness} min={0} max={1} step={0.01} onChange={([a, b]) => updateMaterial(material.id, { roughness: [a!, b!] })} />
          <div className="field">
            <span className="lbl">Per-object samples</span>
            <div className="row" style={{ padding: "0 2px" }}>
              {samples.map((s, i) => (
                <span key={i} title={`metallic ${s.metallic.toFixed(2)}, roughness ${s.roughness.toFixed(2)}`}>
                  <Swatch base={material.base} metallic={s.metallic} roughness={s.roughness} size={36} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Section title="Library" tag={`${materials.length} presets`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 2, margin: "0 -4px" }}>
          {materials.map((m) => (
            <button key={m.id} type="button" className="mat-item" aria-pressed={m.id === material.id} onClick={() => selectMaterial(m.id)}>
              <Swatch base={m.base} metallic={mid(m.metallic)} roughness={mid(m.roughness)} size={38} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Assignments">
        {[
          ...draft.bins.map((b) => ({ key: `bin:${b.id}`, label: b.id, kind: "bin surface", value: assignments.bins[b.id], assign: (id: string) => assignBin(b.id, id) })),
          ...draft.assets.map((a) => ({ key: `asset:${a.id}`, label: a.id, kind: "asset", value: assignments.assets[a.id], assign: (id: string) => assignAsset(a.id, id) })),
        ].map((row) => {
          const current = materials.find((m) => m.id === row.value);
          return (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: "10px minmax(0, 1fr) 148px", gap: 10, alignItems: "center" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: current ? hexFromRgb(current.base) : "transparent", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)" }} />
              <label htmlFor={row.key} style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                <span className="mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.label}
                </span>
                <span style={{ fontSize: 11, color: "var(--subtle)" }}>{row.kind}</span>
              </label>
              <Select
                id={row.key}
                value={row.value ?? ""}
                options={[...(row.value ? [] : [{ value: "", label: "File default", disabled: true }]), ...options]}
                onChange={(id) => id && row.assign(id)}
              />
            </div>
          );
        })}
      </Section>
    </aside>
  );
}
