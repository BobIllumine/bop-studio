import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router";

import { signIn, signOut, useAuthInfo, useSession } from "../api/auth";
import { API_VERSION } from "../api/client";
import { useServerInfo } from "../api/queries";
import { useSettings } from "../state/settings";
import { Parts } from "./controls";
import { SettingsIcon } from "./icons";
import { Logo } from "./Logo";

/** Header shared by every page; pages add their own actions on the right. */
export function TopBar({ left, children }: { left?: ReactNode; children?: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Logo height={34} />
        </div>
        <nav className="ctl seg" aria-label="Sections" style={{ marginLeft: 8 }}>
          <NavLink to="/scene">Scene</NavLink>
          <NavLink to="/assets">Assets</NavLink>
          <NavLink to="/jobs">Jobs &amp; export</NavLink>
        </nav>
        {left}
        <div className="spacer" />
        {children}
        <Account />
        <button type="button" className="ctl ibtn" aria-label="Server settings" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon size={15} />
        </button>
      </header>
      <ServerBanner onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

/** Sign-in state for servers with an OIDC provider; refetches everything when it changes. */
function Account() {
  const auth = useAuthInfo();
  const user = useSession((s) => s.user);
  const client = useQueryClient();
  const subject = user?.profile.sub;
  const previous = useRef(subject);
  useEffect(() => {
    if (previous.current === subject) return;
    previous.current = subject;
    void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
  }, [subject, client]);
  const oidc = auth.data?.oidc;
  if (!oidc) return null;
  if (!user) {
    return (
      <button type="button" className="ctl btn primary" onClick={() => void signIn(oidc)}>
        Sign in
      </button>
    );
  }
  const name = user.profile.preferred_username ?? user.profile.name ?? user.profile.sub;
  return (
    <button type="button" className="ctl btn" title={`Signed in as ${name}`} onClick={() => void signOut(oidc)}>
      {name} · Sign out
    </button>
  );
}

/** Warns when the server is unreachable, needs credentials, or speaks another API version. */
function ServerBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const info = useServerInfo();
  const oidc = useAuthInfo().data?.oidc;
  let message: string | null = null;
  if (info.error) {
    const status = (info.error as { status?: number }).status;
    if (status === 401 && oidc) {
      return (
        <div className="banner" role="status">
          <span>Sign in to use this server.</span>
          <button type="button" className="ctl btn" style={{ height: 26 }} onClick={() => void signIn(oidc)}>
            Sign in
          </button>
        </div>
      );
    }
    message =
      status === 401
        ? "The server needs an API token."
        : status === 403
          ? "Your account is not allowed to use this server; ask its administrator to add you."
          : `Cannot reach bop-server: ${info.error.message}`;
  } else if (info.data && info.data.api !== API_VERSION) {
    message = `This studio speaks API ${API_VERSION}; the server speaks ${info.data.api}. Some actions may fail.`;
  }
  if (!message) return null;
  return (
    <div className="banner" role="status">
      <span>{message}</span>
      <button type="button" className="ctl btn" style={{ height: 26 }} onClick={onOpenSettings}>
        Server settings
      </button>
    </div>
  );
}

export function StatusBar({ items }: { items?: ReactNode[] }) {
  const info = useServerInfo();
  const apiBase = useSettings((s) => s.apiBase);
  const host = apiBase ? apiBase.replace(/^https?:\/\//, "") : window.location.host;
  const color = info.data ? "var(--ok)" : info.isPending ? "var(--subtle)" : "var(--error)";
  return (
    <footer className="statusbar">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span className="dot" style={{ background: color }} />
        <Parts items={["bop-server", host, ...(info.data ? [`v${info.data.server}`] : [])]} />
      </span>
      {items && items.length > 0 && <Parts items={items} />}
    </footer>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const [apiBase, setApiBase] = useState(settings.apiBase);
  const [token, setToken] = useState(settings.token);
  const info = useServerInfo();
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <form
          className="sec"
          onSubmit={(event) => {
            event.preventDefault();
            settings.set({ apiBase: apiBase.trim(), token: token.trim() });
            onClose();
          }}
        >
          <div className="sec-h">
            <h2 id="settings-title" className="sec-t">
              Server
            </h2>
            {info.data && (
              <span className="sec-k">
                <Parts items={[`bop-server ${info.data.server}`, `api ${info.data.api}`]} />
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="api-base" className="lbl">
              Server URL
            </label>
            <input
              id="api-base"
              className="ctl"
              placeholder="Same origin as this page"
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="api-token" className="lbl">
              API token
            </label>
            <input
              id="api-token"
              className="ctl"
              type="password"
              autoComplete="off"
              placeholder="BOP_API_TOKEN, for servers without sign-in"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="ctl btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ctl btn primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
