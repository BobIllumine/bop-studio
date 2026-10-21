import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  ApiError,
  api,
  apiUrl,
  authHeaders,
  encodePath,
  sessionHeaders,
  unwrap,
  type ExportFormat,
  type Job,
  type JobEvent,
  type OptimizeAssetRequest,
} from "./client";
import { useSettings } from "../state/settings";

/** Query keys include the server address so switching servers refetches everything. */
const useServerKey = () => useSettings((s) => s.apiBase);

export function useServerInfo() {
  const server = useServerKey();
  return useQuery({
    queryKey: ["version", server],
    queryFn: async () => unwrap(await api.GET("/api/v1/version")),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useLibrary() {
  const server = useServerKey();
  return useQuery({
    queryKey: ["assets", server],
    queryFn: async () => unwrap(await api.GET("/api/v1/assets")),
  });
}

export function useUploadAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, file }: { path: string; file: Blob }) => {
      const response = await fetch(apiUrl(`/api/v1/assets/${encodePath(path)}`), {
        method: "PUT",
        headers: { ...authHeaders(), "content-type": "application/octet-stream" },
        body: file,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(body.error ?? `${response.status} ${response.statusText}`, response.status);
      }
    },
    onSuccess: (_, { path }) => {
      client.invalidateQueries({ queryKey: ["assets"] });
      client.removeQueries({ queryKey: ["asset-geometry", path] });
    },
  });
}

export function useDeleteAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) =>
      unwrap(await api.DELETE("/api/v1/assets/{path}", { params: { path: { path } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["assets"] }),
  });
}

/** Writes `<name>.optimized.glb` next to a library mesh and reports what changed. */
export function useOptimizeAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: OptimizeAssetRequest) => unwrap(await api.POST("/api/v1/asset-optimizations", { body })),
    onSuccess: (report) => {
      client.invalidateQueries({ queryKey: ["assets"] });
      client.removeQueries({ queryKey: ["asset-geometry", report.path] });
    },
  });
}

/** Returns `value` once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** Checks the configuration on the server as it is edited (debounced). */
export function useValidation(toml: string) {
  const server = useServerKey();
  const settled = useDebounced(toml, 400);
  return useQuery({
    queryKey: ["validate", server, settled],
    queryFn: async () => {
      const result = await api.POST("/api/v1/configs/validate", { body: { config: settled } });
      if (result.response.status === 422) {
        return { ok: false as const, error: (result.error as { error: string }).error };
      }
      return { ok: true as const, report: unwrap(result) };
    },
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function useJobs() {
  const server = useServerKey();
  return useQuery({
    queryKey: ["jobs", server],
    queryFn: async () => unwrap(await api.GET("/api/v1/jobs", { params: { query: { limit: 200 } } })),
    refetchInterval: 4000,
  });
}

export function useJobFiles(id: string | undefined, state: Job["state"] | undefined) {
  const server = useServerKey();
  return useQuery({
    queryKey: ["job-files", server, id, state],
    queryFn: async () => unwrap(await api.GET("/api/v1/jobs/{id}/files", { params: { path: { id: id! } } })),
    enabled: Boolean(id),
    // Scenes are stored as they are committed.
    refetchInterval: state === "running" || state === "finalizing" ? 5000 : false,
  });
}

export function useJobConfig(id: string | undefined) {
  const server = useServerKey();
  return useQuery({
    queryKey: ["job-config", server, id],
    queryFn: async () => {
      const response = await fetch(apiUrl(`/api/v1/jobs/${encodeURIComponent(id!)}/config`), { headers: await sessionHeaders() });
      if (!response.ok) throw new ApiError(`${response.status} ${response.statusText}`, response.status);
      return response.text();
    },
    enabled: Boolean(id),
    staleTime: Infinity,
  });
}

export function useCreateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: { config: string; renderer: string }) =>
      unwrap(await api.POST("/api/v1/jobs", { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useJobAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "cancel" | "resume" }) => {
      const path = action === "cancel" ? "/api/v1/jobs/{id}/cancel" : "/api/v1/jobs/{id}/resume";
      const result = await api.POST(path, { params: { path: { id } } });
      if (!result.response.ok) unwrap(result);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useCreateExport() {
  return useMutation({
    mutationFn: async ({ id, format, expiresIn }: { id: string; format: ExportFormat; expiresIn: number }) =>
      unwrap(
        await api.POST("/api/v1/jobs/{id}/exports", {
          params: { path: { id } },
          body: { format, expires_in_s: expiresIn },
        }),
      ),
  });
}

/** A received `job` event with the time it arrived. */
export interface TimedEvent {
  at: number;
  event: JobEvent | Job;
}

/**
 * Follows `GET /jobs/{id}/events`. The stream is read with fetch rather than
 * EventSource, which cannot send the bearer token.
 */
export function useJobEvents(id: string | undefined): TimedEvent[] {
  const [events, setEvents] = useState<TimedEvent[]>([]);
  const apiBase = useServerKey();
  const client = useQueryClient();
  useEffect(() => {
    setEvents([]);
    if (!id) return;
    const controller = new AbortController();
    (async () => {
      const response = await fetch(apiUrl(`/api/v1/jobs/${encodeURIComponent(id)}/events`), {
        headers: { ...(await sessionHeaders()), accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) return;
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          const event = JSON.parse(data) as JobEvent | Job;
          setEvents((list) => [...list.slice(-199), { at: Date.now(), event }]);
          client.invalidateQueries({ queryKey: ["jobs"] });
        }
      }
    })().catch(() => {
      // Aborted on unmount or the server went away; the job list still polls.
    });
    return () => controller.abort();
  }, [id, apiBase, client]);
  return events;
}
