import { useMemo, useState } from "react";

import type { Check } from "../../preview/checks";
import { CopyIcon, DownloadIcon } from "../../ui/icons";

const LEVEL_COLOR: Record<Check["level"], string> = { ok: "var(--ok)", warn: "var(--warn)", error: "var(--error)" };

/** Colours one TOML line: headers, keys, strings, numbers, comments. */
function highlight(line: string): { text: string; color: string }[] {
  if (!line) return [{ text: " ", color: "var(--subtle)" }];
  if (line.startsWith("#")) return [{ text: line, color: "#7a828d" }];
  if (line.startsWith("[")) return [{ text: line, color: "var(--ink)" }];
  const eq = line.indexOf(" = ");
  if (eq < 0) return [{ text: line, color: "var(--text)" }];
  const parts = [
    { text: line.slice(0, eq), color: "#c59bff" },
    { text: " = ", color: "var(--faint)" },
  ];
  const value = line.slice(eq + 3);
  const token = /("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:e-?\d+)?)|(true|false)|([^"\d\-tf]+|[\-tf])/g;
  for (const match of value.matchAll(token)) {
    parts.push({
      text: match[0],
      color: match[1] ? "#e9c38a" : match[2] || match[3] ? "var(--info)" : "var(--subtle)",
    });
  }
  return parts;
}

export function Dock({ toml, checks, fileName }: { toml: string; checks: Check[]; fileName: string }) {
  const [tab, setTab] = useState<"toml" | "checks">("toml");
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => toml.trimEnd().split("\n").map(highlight), [toml]);
  const issues = checks.filter((c) => c.level !== "ok").length;
  const save = () => {
    const url = URL.createObjectURL(new Blob([toml], { type: "application/toml" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="dock" aria-label="Details">
      <div className="row" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
        <div className="ctl seg" role="tablist" aria-label="Details">
          <button type="button" role="tab" aria-selected={tab === "toml"} onClick={() => setTab("toml")}>
            Resolved config
          </button>
          <button type="button" role="tab" aria-selected={tab === "checks"} onClick={() => setTab("checks")}>
            Checks
            {issues > 0 && <span className="count">{issues}</span>}
          </button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="ctl btn"
            onClick={async () => {
              await navigator.clipboard.writeText(toml);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <CopyIcon size={13} />
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="ctl btn" onClick={save}>
            <DownloadIcon size={13} />
            Save .toml
          </button>
        </div>
      </div>
      <div className="dock-body">
        {tab === "toml" ? (
          <div className="code">
            {lines.map((parts, i) => (
              <div key={i}>
                <span className="ln">{i + 1}</span>
                {parts.map((p, j) => (
                  <span key={j} style={{ color: p.color }}>
                    {p.text}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <ul className="checks">
            {checks.map((check, i) => (
              <li key={i}>
                <span className="mono" style={{ fontSize: 11, color: LEVEL_COLOR[check.level] }}>
                  {check.level}
                </span>
                <span style={{ color: "#d5dadf", lineHeight: 1.45 }}>{check.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
