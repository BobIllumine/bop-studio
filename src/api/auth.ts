import { useQuery } from "@tanstack/react-query";
import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { create } from "zustand";

import { useSettings } from "../state/settings";
import type { components } from "./schema";

export type AuthInfo = components["schemas"]["AuthInfo"];
export type OidcInfo = components["schemas"]["OidcInfo"];

/** Where the provider sends the browser back; register it with the provider. */
export const CALLBACK_PATH = "/auth/callback";
/** The provider a sign-in was started with, read back on the callback page. */
const PENDING_KEY = "bop-studio.oidc";

/** The signed-in user of the server's OIDC provider, if any. */
interface Session {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const useSession = create<Session>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

const managers = new Map<string, UserManager>();

/**
 * One manager per provider and client. Tokens live in sessionStorage, so they
 * end with the tab and are never shared with other tabs or kept on disk.
 */
function manager(oidc: OidcInfo): UserManager {
  const key = `${oidc.issuer} ${oidc.client_id}`;
  let existing = managers.get(key);
  if (!existing) {
    existing = new UserManager({
      authority: oidc.issuer,
      client_id: oidc.client_id,
      redirect_uri: `${window.location.origin}${CALLBACK_PATH}`,
      post_logout_redirect_uri: window.location.origin,
      response_type: "code",
      scope: oidc.scopes,
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      // Renews with the refresh token (offline_access) before the access token expires.
      automaticSilentRenew: true,
      // The ID token is not needed for API calls; skip the extra request.
      loadUserInfo: false,
    });
    existing.events.addUserLoaded((user) => useSession.getState().setUser(user));
    existing.events.addUserUnloaded(() => useSession.getState().setUser(null));
    existing.events.addSilentRenewError(() => {
      void existing!.removeUser();
    });
    managers.set(key, existing);
  }
  return existing;
}

/** The current access token, if signed in and not expired. */
export function accessToken(): string | null {
  const user = useSession.getState().user;
  return user && !user.expired ? user.access_token : null;
}

async function fetchAuthInfo(apiBase: string): Promise<AuthInfo> {
  const response = await fetch(`${apiBase.replace(/\/+$/, "")}/api/v1/auth`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as AuthInfo;
}

/**
 * How the configured server wants to be signed in to. Restores an earlier
 * session for its provider from this tab, if there is one.
 */
export function useAuthInfo() {
  const apiBase = useSettings((s) => s.apiBase);
  return useQuery({
    queryKey: ["auth", apiBase],
    queryFn: async () => {
      const info = await fetchAuthInfo(apiBase);
      const user = info.oidc ? await manager(info.oidc).getUser() : null;
      useSession.getState().setUser(user && !user.expired ? user : null);
      return info;
    },
    staleTime: Infinity,
    retry: false,
  });
}

/** Sends the browser to the provider; it returns to [`CALLBACK_PATH`]. */
export async function signIn(oidc: OidcInfo): Promise<void> {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(oidc));
  const returnTo = window.location.pathname + window.location.search;
  await manager(oidc).signinRedirect({ state: { returnTo } });
}

/** Ends the session here and at the provider. */
export async function signOut(oidc: OidcInfo): Promise<void> {
  const users = manager(oidc);
  const user = await users.getUser();
  await users.removeUser();
  if (user) await users.signoutRedirect({ id_token_hint: user.id_token });
}

/**
 * Completes a sign-in on the callback page and returns where to go next.
 * Only same-origin paths are returned, so the state cannot redirect elsewhere.
 */
export async function completeSignIn(): Promise<string> {
  const pending = sessionStorage.getItem(PENDING_KEY);
  if (!pending) throw new Error("No sign-in was started in this tab.");
  const user = await manager(JSON.parse(pending) as OidcInfo).signinRedirectCallback();
  sessionStorage.removeItem(PENDING_KEY);
  return safeReturnPath((user.state as { returnTo?: unknown } | undefined)?.returnTo, window.location.origin);
}

/** `returnTo` as a path on `origin`, or `/` if it is not one. */
export function safeReturnPath(returnTo: unknown, origin: string): string {
  if (typeof returnTo !== "string") return "/";
  const target = new URL(returnTo, origin);
  return target.origin === origin ? target.pathname + target.search : "/";
}
