import createClient, { type Middleware } from "openapi-fetch";

import { useSettings } from "../state/settings";
import { accessToken } from "./auth";
import type { components, paths } from "./schema";

export type Job = components["schemas"]["Job"];
export type JobState = components["schemas"]["JobState"];
export type JobEvent = components["schemas"]["JobEvent"];
export type StoredObject = components["schemas"]["StoredObject"];
export type ServerInfo = components["schemas"]["ServerInfo"];
export type ConfigReport = components["schemas"]["ConfigReport"];
export type ExportFormat = components["schemas"]["ExportFormat"];
export type ExportLink = components["schemas"]["ExportLink"];
export type OptimizeAssetRequest = components["schemas"]["OptimizeAsset"];
export type OptimizedAssetReport = components["schemas"]["OptimizedAssetReport"];

/** The API version this build was generated against (`contract/api.openapi.json`). */
export const API_VERSION = "v1";

/** Absolute or same-origin URL for an API path such as `/api/v1/jobs`. */
export function apiUrl(path: string): string {
  const base = useSettings.getState().apiBase.replace(/\/+$/, "");
  return `${base}${path}`;
}

/**
 * Headers every request carries: the signed-in user's access token, else the
 * API token when one is configured.
 */
export function authHeaders(): Record<string, string> {
  const token = accessToken() ?? useSettings.getState().token.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const auth: Middleware = {
  onRequest({ request }) {
    for (const [name, value] of Object.entries(authHeaders())) {
      request.headers.set(name, value);
    }
    return request;
  },
};

/** Typed client for `/api/v1`; the base URL is read on every request. */
export const api = createClient<paths>({
  baseUrl: "",
  fetch: (request: Request) => {
    const url = new URL(request.url);
    const base = useSettings.getState().apiBase.replace(/\/+$/, "");
    if (!base) return fetch(request);
    return fetch(new Request(`${base}${url.pathname}${url.search}`, request));
  },
});
api.use(auth);

/** The `{ error }` body bop-server returns on failure, or a status line. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Unwraps an openapi-fetch result, throwing [`ApiError`] on failure. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok) return result.data as T;
  const body = result.error as { error?: string } | undefined;
  throw new ApiError(
    body?.error ?? `${result.response.status} ${result.response.statusText}`,
    result.response.status,
  );
}

/** Fetches raw bytes from an API path with the configured credentials. */
export async function fetchBytes(path: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(apiUrl(path), { headers: authHeaders(), signal });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {
      // Not JSON; keep the status line.
    }
    throw new ApiError(message, response.status);
  }
  return response.arrayBuffer();
}

/** Encodes a library path segment by segment, keeping its slashes. */
export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** Uploads a file to the asset library, reporting progress from 0 to 1. */
export function uploadAsset(path: string, file: Blob, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", apiUrl(`/api/v1/assets/${encodePath(path)}`));
    for (const [name, value] of Object.entries(authHeaders())) request.setRequestHeader(name, value);
    request.setRequestHeader("content-type", "application/octet-stream");
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      let message = `${request.status} ${request.statusText}`;
      try {
        message = (JSON.parse(request.responseText) as { error?: string }).error ?? message;
      } catch {
        // Not JSON; keep the status line.
      }
      reject(new ApiError(message, request.status));
    };
    request.onerror = () => reject(new ApiError("network error", 0));
    request.send(file);
  });
}

/** Content types a fetched result file may be shown as in a new tab; anything else is downloaded. */
const VIEWABLE: Record<string, string> = { png: "image/png", json: "text/plain", toml: "text/plain", txt: "text/plain" };

/**
 * Opens or saves a file from an API path with the configured credentials.
 * Files are user data, so only inert types are shown in this origin.
 */
export async function openFile(path: string, fileName: string): Promise<void> {
  const bytes = await fetchBytes(path);
  const type = VIEWABLE[fileName.split(".").pop()?.toLowerCase() ?? ""];
  const url = URL.createObjectURL(new Blob([bytes], { type: type ?? "application/octet-stream" }));
  if (type) {
    window.open(url, "_blank", "noopener");
  } else {
    Object.assign(document.createElement("a"), { href: url, download: fileName.split("/").pop() }).click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
