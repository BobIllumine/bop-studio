import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { type ExportFormat, type ExportLink, type Job, apiUrl, authHeaders, encodePath, openFile } from "../api/client";
import { useCreateExport, useJobAction, useJobConfig, useJobEvents, useJobFiles, useJobs, type TimedEvent } from "../api/queries";
import { useProject } from "../state/project";
import { Parts, Section, Seg, Select } from "../ui/controls";
import { ClockIcon, CopyIcon, DownloadIcon, FileIcon, LinkIcon } from "../ui/icons";
import { StatusBar, TopBar } from "../ui/layout";
import { DatasetPreview } from "./jobs/DatasetPreview";

const STATE_COLOR: Record<Job["state"], string> = {
  queued: "var(--subtle)",
  running: "var(--info)",
  finalizing: "var(--finalize)",
  succeeded: "var(--ok)",
  failed: "var(--error)",
  cancelled: "var(--warn)",
};
const STATE_BORDER: Record<Job["state"], string> = {
  queued: "#333842",
  running: "#2c3f5e",
  finalizing: "#46385e",
  succeeded: "#2f5a43",
  failed: "#6a3530",
  cancelled: "#5e4e2a",
};
const BAR_COLOR: Partial<Record<Job["state"], string>> = { failed: "var(--error)", cancelled: "var(--warn)", succeeded: "var(--ok)" };

const short = (id: string) => id.slice(0, 8);
const pct = (job: Job) => (job.total_scenes > 0 ? `${Math.min(100, (job.committed_scenes / job.total_scenes) * 100)}%` : "0%");
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

function size(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function duration(job: Job) {
  if (!job.started_at_ms) return "—";
  const s = Math.round(((job.finished_at_ms ?? Date.now()) - job.started_at_ms) / 1000);
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

function StateBadge({ job, framed }: { job: Job; framed?: boolean }) {
  // A running job with a cancel pending still finishes its in-flight scenes.
  const cancelling = job.state === "running" && job.cancel_requested;
  const color = cancelling ? "var(--warn)" : STATE_COLOR[job.state];
  const border = cancelling ? STATE_BORDER.cancelled : STATE_BORDER[job.state];
  return (
    <span
      className="state"
      style={{ color, ...(framed ? { border: `1px solid ${border}`, borderRadius: 4, padding: "3px 8px" } : {}) }}
    >
      <span className="dot" style={{ background: color }} />
      {cancelling ? "cancelling" : job.state}
    </span>
  );
}

type Filter = "all" | "active" | "done" | "stopped";
const matches = (filter: Filter, job: Job) =>
  filter === "all" ||
  (filter === "active" && ["queued", "running", "finalizing"].includes(job.state)) ||
  (filter === "done" && job.state === "succeeded") ||
  (filter === "stopped" && ["failed", "cancelled"].includes(job.state));

export default function JobsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const jobs = useJobs();
  const [filter, setFilter] = useState<Filter>("all");
  const list = (jobs.data ?? []).filter((job) => matches(filter, job));
  const job = jobs.data?.find((j) => j.id === id) ?? (id ? undefined : jobs.data?.[0]);
  const running = (jobs.data ?? []).filter((j) => j.state === "running" || j.state === "finalizing").length;
  const queued = (jobs.data ?? []).filter((j) => j.state === "queued").length;

  return (
    <div className="app">
      <TopBar />
      <div className="cols">
        <aside className="panel left wide" aria-label="Jobs">
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, borderBottom: "1px solid var(--line)" }}>
            <div className="row">
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Jobs</h1>
              <span className="val muted">{jobs.data?.length ?? 0} total</span>
            </div>
            <Seg
              label="Filter jobs"
              full
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "done", label: "Done" },
                { value: "stopped", label: "Stopped" },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>
          {jobs.error && <div className="notice error" style={{ margin: 16 }}>{jobs.error.message}</div>}
          {list.map((j) => (
            <button key={j.id} type="button" className="job" aria-pressed={j.id === job?.id} onClick={() => navigate(`/jobs/${j.id}`)}>
              <span className="row" style={{ width: "100%" }}>
                <span className="mono" style={{ fontSize: 13 }}>
                  {short(j.id)}
                </span>
                <StateBadge job={j} />
              </span>
              <span className="progress" style={{ width: "100%" }}>
                <span style={{ width: pct(j), background: BAR_COLOR[j.state] }} />
              </span>
              <span className="row mono" style={{ width: "100%", fontSize: 11, color: "var(--subtle)" }}>
                <Parts items={[`${j.committed_scenes}/${j.total_scenes}`, j.renderer]} />
                <span>{ago(j.created_at_ms)}</span>
              </span>
            </button>
          ))}
          {!jobs.isPending && list.length === 0 && <div className="empty">No jobs yet.</div>}
        </aside>
        <main className="main-scroll">{job ? <JobDetail key={job.id} job={job} /> : <div className="empty">{id ? "No such job." : "Select a job."}</div>}</main>
      </div>
      <StatusBar items={[`${running} running`, `${queued} queued`]} />
    </div>
  );
}

function describe(event: TimedEvent): { text: string; color: string } {
  const e = event.event;
  const done = e.committed_scenes;
  switch (e.state) {
    case "queued":
      return { text: "queued", color: "var(--subtle)" };
    case "running":
      return e.cancel_requested
        ? { text: `cancel requested: stopping after the in-flight scenes (${done} of ${e.total_scenes} committed)`, color: "var(--warn)" }
        : { text: `running: ${done} of ${e.total_scenes} scenes committed`, color: "var(--text)" };
    case "finalizing":
      return { text: "all scenes committed, storing files and exports", color: "var(--finalize)" };
    case "succeeded":
      return { text: "succeeded", color: "var(--ok)" };
    case "failed":
      return { text: `failed: ${e.error ?? "unknown error"}`, color: "var(--error)" };
    case "cancelled":
      return { text: "cancelled", color: "var(--warn)" };
  }
}

/** What the job record says happened, before any live events. */
function history(job: Job): { at: number; text: string; color: string }[] {
  const lines = [{ at: job.created_at_ms, text: `submitted: ${job.total_scenes} scenes on ${job.renderer}`, color: "var(--muted)" }];
  if (job.started_at_ms) lines.push({ at: job.started_at_ms, text: "started", color: "var(--text)" });
  if (job.finished_at_ms) {
    const { text, color } = describe({ at: job.finished_at_ms, event: job });
    lines.push({ at: job.finished_at_ms, text, color });
  } else if (job.started_at_ms) {
    lines.push({ at: job.updated_at_ms, text: describe({ at: job.updated_at_ms, event: job }).text, color: "var(--text)" });
  }
  return lines;
}

function JobDetail({ job }: { job: Job }) {
  const action = useJobAction();
  const events = useJobEvents(job.id);
  const files = useJobFiles(job.id, job.state);
  const config = useJobConfig(job.id);
  const loadToml = useProject((s) => s.loadToml);
  const navigate = useNavigate();
  const canCancel = job.state === "queued" || job.state === "running";
  const canResume = job.state === "failed" || job.state === "cancelled";
  const fileList = files.data ?? [];
  const shown = fileList.slice(0, 12);

  return (
    <>
      <section className="sec" style={{ padding: "20px 24px", gap: 14 }}>
        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
                {short(job.id)}
              </h2>
              <StateBadge job={job} framed />
            </div>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {job.id}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="ctl btn"
              disabled={!config.data}
              onClick={() => {
                loadToml(config.data!, `job-${short(job.id)}.toml`);
                navigate("/scene");
              }}
            >
              <FileIcon size={13} />
              Open config
            </button>
            {canCancel && (
              <button
                type="button"
                className="ctl btn danger"
                disabled={action.isPending || job.cancel_requested}
                title={job.cancel_requested ? "Stops once the scenes being simulated and rendered now are committed" : undefined}
                onClick={() => action.mutate({ id: job.id, action: "cancel" })}
              >
                {job.cancel_requested ? "Cancelling…" : "Cancel"}
              </button>
            )}
            {canResume && (
              <button type="button" className="ctl btn primary" disabled={action.isPending} onClick={() => action.mutate({ id: job.id, action: "resume" })}>
                Resume
              </button>
            )}
          </div>
        </div>
        {action.error && <div className="notice error">{action.error.message}</div>}
        {job.error && <div className="notice error">{job.error}</div>}
        <div className="field">
          <div className="row">
            <span className="lbl">Valid scenes</span>
            <span className="val">
              {job.committed_scenes} / {job.total_scenes}
            </span>
          </div>
          <div className="progress" role="progressbar" aria-label="Scenes committed" aria-valuemin={0} aria-valuemax={job.total_scenes} aria-valuenow={job.committed_scenes}>
            <span style={{ width: pct(job), background: BAR_COLOR[job.state] }} />
          </div>
        </div>
        <div className="stats">
          {[
            ["Renderer", job.renderer],
            ["Duration", duration(job)],
            ["Submitted", new Date(job.created_at_ms).toLocaleString()],
            ["Finished", job.finished_at_ms ? new Date(job.finished_at_ms).toLocaleString() : "—"],
          ].map(([k, v]) => (
            <div key={k} className="stat">
              <span className="lbl">{k}</span>
              <span className="val" style={{ fontSize: 13 }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </section>

      <Section title="Preview" tag={`${job.committed_scenes} scenes committed`} style={{ padding: "20px 24px", gap: 14 }}>
        <DatasetPreview job={job.id} files={fileList} />
      </Section>

      <Section title="Export" style={{ padding: "20px 24px", gap: 14 }}>
        {job.state === "succeeded" ? (
          <ExportPanel job={job} />
        ) : (
          <div className="notice">
            <ClockIcon />
            <span>Export opens when the job succeeds.</span>
          </div>
        )}
      </Section>

      <Section title="Events" tag={`GET /jobs/${short(job.id)}…/events`} style={{ padding: "20px 24px", gap: 14 }}>
        <div className="log">
          {history(job).map((line) => (
            <div key={line.text} style={{ display: "flex", gap: 14, padding: "0 14px" }}>
              <span style={{ color: "#4a505a", flex: "none" }}>{clock(line.at)}</span>
              <span style={{ color: line.color }}>{line.text}</span>
            </div>
          ))}
          {/* The stream opens with the current state, which the history already shows. */}
          {events.slice(1).map((event, i) => {
            const { text, color } = describe(event);
            return (
              <div key={i} style={{ display: "flex", gap: 14, padding: "0 14px" }}>
                <span style={{ color: "#4a505a", flex: "none" }}>{clock(event.at)}</span>
                <span style={{ color }}>{text}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Files" tag={fileList.length ? `${fileList.length} files, ${size(fileList.reduce((s, f) => s + f.size, 0))}` : undefined} style={{ padding: "20px 24px", gap: 14 }}>
        {fileList.length === 0 ? (
          <span className="lbl">No files yet.</span>
        ) : (
          <table className="files">
            <tbody>
              {shown.map((f) => (
                <tr key={f.path}>
                  <td className="mono">
                    <a
                      href={apiUrl(`/api/v1/jobs/${job.id}/files/${encodePath(f.path)}`)}
                      onClick={(event) => {
                        // A plain link cannot send the bearer token.
                        event.preventDefault();
                        openFile(`/api/v1/jobs/${encodeURIComponent(job.id)}/files/${encodePath(f.path)}`, f.path).catch((error: Error) => alert(`Cannot open ${f.path}: ${error.message}`));
                      }}
                      style={{ color: "var(--text)", textDecoration: "none" }}
                    >
                      {f.path}
                    </a>
                  </td>
                  <td className="mono muted" style={{ textAlign: "right" }}>
                    {size(f.size)}
                  </td>
                </tr>
              ))}
              {fileList.length > shown.length && (
                <tr>
                  <td className="muted" colSpan={2}>
                    and {fileList.length - shown.length} more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}

/** Saves an export reached through the API (local storage), sending the token. */
async function downloadThroughApi(link: ExportLink) {
  const response = await fetch(apiUrl(link.url), { headers: authHeaders() });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const url = URL.createObjectURL(await response.blob());
  Object.assign(document.createElement("a"), { href: url, download: link.file_name }).click();
  URL.revokeObjectURL(url);
}

function ExportPanel({ job }: { job: Job }) {
  const [format, setFormat] = useState<ExportFormat>(job.export_bop ? "bop" : "dataset");
  const [expiry, setExpiry] = useState("86400");
  const [copied, setCopied] = useState(false);
  const create = useCreateExport();
  const link = create.data;
  const signed = link?.signed ?? true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 240px) minmax(0, 200px)", gap: 16 }}>
        <div className="field">
          <span className="lbl">Format</span>
          <Seg
            label="Format"
            full
            options={[
              {
                value: "bop",
                label: "BOP",
                disabled: !job.export_bop,
                title: job.export_bop ? "The BOP 6D-pose format (train_pbr, models in mm)" : "This job was submitted without a BOP export",
              },
              { value: "dataset", label: "Dataset" },
            ]}
            value={format}
            onChange={(value) => {
              setFormat(value);
              create.reset();
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="expiry" className="lbl">
            Link expires after
          </label>
          <Select
            id="expiry"
            value={expiry}
            options={[
              { value: "3600", label: "1 hour" },
              { value: "86400", label: "24 hours" },
              { value: "604800", label: "7 days" },
            ]}
            onChange={(value) => {
              setExpiry(value);
              create.reset();
            }}
          />
        </div>
      </div>
      {!link && (
        <div>
          <button type="button" className="ctl btn primary" disabled={create.isPending} onClick={() => create.mutate({ id: job.id, format, expiresIn: Number(expiry) })}>
            <LinkIcon size={13} />
            {create.isPending ? "Packing archive…" : "Create download link"}
          </button>
        </div>
      )}
      {create.error && <div className="notice error">{create.error.message}</div>}
      {link && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel)" }}>
          <div className="row">
            <span className="mono" style={{ fontSize: 13 }}>
              {link.file_name}
            </span>
            <Parts
              className="mono"
              style={{ fontSize: 11, color: "var(--subtle)" }}
              items={[size(link.size), link.expires_at_ms ? `expires ${new Date(link.expires_at_ms).toLocaleString()}` : "through the API"]}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="ctl" readOnly aria-label="Download link" value={signed ? link.url : apiUrl(link.url)} style={{ flex: "1 1 auto", minWidth: 0, color: "var(--muted)" }} />
            {signed && (
              <button
                type="button"
                className="ctl btn"
                style={{ minWidth: 88 }}
                onClick={async () => {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <CopyIcon size={13} />
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            {signed ? (
              <a className="ctl btn primary" href={link.url} download={link.file_name}>
                <DownloadIcon size={13} />
                Download
              </a>
            ) : (
              <button type="button" className="ctl btn primary" onClick={() => downloadThroughApi(link)}>
                <DownloadIcon size={13} />
                Download
              </button>
            )}
          </div>
          <div>
            <button type="button" className="ctl btn" onClick={() => create.reset()}>
              New link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
