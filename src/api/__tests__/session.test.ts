import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("oidc-client-ts", () => ({
  UserManager: class {
    events = { addUserLoaded() {}, addUserUnloaded() {}, addSilentRenewError() {} };
    getUser = async () => ({ access_token: "restored-token", expired: false });
  },
  WebStorageStateStore: class {},
}));

describe("requests made while the page is loading", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("wait for this tab's session and carry its token", async () => {
    vi.stubGlobal("window", { location: { origin: "https://studio.example" }, sessionStorage: {} });
    const seen: Record<string, string | null> = {};
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (input.endsWith("/api/v1/auth")) {
        // The server answers after the page has already asked for an asset.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return Response.json({
          required: true,
          api_token: false,
          oidc: { issuer: "https://auth.example/application/o/bop/", client_id: "bop-studio", scopes: "openid" },
        });
      }
      seen[input] = new Headers(init?.headers).get("authorization");
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const { fetchBytes } = await import("../client");

    await fetchBytes("/api/v1/assets/part.stl");

    expect(seen["/api/v1/assets/part.stl"]).toBe("Bearer restored-token");
  });
});
