# bop studio

Web UI for [bop-server](../bop-dataset-gen): set up scenes, manage the asset
library, run generation jobs, and download exports.

- **Scene:** bins, populations, cameras and physics, with a live 3D preview of
  the bins, the real meshes, every camera's view volume, and the selected
  camera's image. The resolved configuration and the server's checks update as
  you edit.
- **Assets:** upload STL and GLB files to the server's library, preview them,
  and set each asset's units, physics and collision settings.
- **Jobs & export:** follow jobs live, cancel or resume them, browse their
  files, and pack a finished job into a download link.

The preview places objects with a quick seeded heuristic, not physics; the
server's Rapier simulation decides the real scenes.

## Development

Uses [bun](https://bun.sh) 1.3 (see `packageManager` in `package.json`).

```text
bun install
bun run dev            # http://localhost:5173, proxies /api to localhost:8080
```

`bunfig.toml` only installs package versions published at least three days
ago, and bun never runs dependencies' install scripts.

Start a server from the bop-dataset-gen checkout with
`cargo run -p bop-server`. Point the dev proxy elsewhere with
`BOP_API_URL=http://host:8080 bun run dev`, or pick any server at run time
under *Server settings* (gear icon), which also takes the API token.

| Check | Command |
| --- | --- |
| Types | `bun run typecheck` |
| Unit tests | `bun run test` |
| Against a live server | `BOP_SERVER_URL=http://localhost:8080 bun run test` |
| Build | `bun run build` |

## The API contract

The client is generated from bop-server's OpenAPI document, pinned in
`contract/`. After a server API change:

```text
bun run contract:sync -- ../bop-dataset-gen   # copy schemas/, regenerate src/api/schema.d.ts
bun run typecheck                              # fix what the new contract breaks
```

CI fails if `src/api/schema.d.ts` does not match `contract/api.openapi.json`.
At run time the studio warns when the server reports another API version.

## Signing in

The studio asks the server how to authenticate (`GET /api/v1/auth`):

- **OIDC (authentik):** when bop-server is configured with `BOP_OIDC_*`, the
  top bar shows *Sign in*. The studio signs in as a public client with the
  authorization code flow and PKCE, and renews the access token with its
  refresh token. Tokens are kept in this tab's sessionStorage only. Register
  `<studio origin>/auth/callback` as the provider's redirect URI.
- **API token:** for servers started with `BOP_API_TOKEN`, enter it under
  *Server settings*. It is kept in this browser's localStorage.

For authentik in containers, run the whole stack from bop-dataset-gen:
`docker compose -f deploy/compose.yaml -f deploy/authentik.yaml --profile local --profile studio up -d`
(see `deploy/authentik.yaml` there).

## Deployment

The image serves the built app with Caddy and proxies `/api` to the server, so
the browser sees one origin:

```text
docker build -t bop-studio .
docker run -p 3000:8080 -e BOP_API_UPSTREAM=bop-server:8080 bop-studio
```

`deploy/compose.example.yaml` runs it next to a bop-server image. Caddy sends
a strict Content-Security-Policy; with a sign-in provider or API server on
another origin over plain HTTP, add it to `BOP_CONNECT_SRC` (default
`https:`, any HTTPS origin), e.g. `BOP_CONNECT_SRC="https: http://localhost:9000"`. To host the
studio on its own origin instead, build with `VITE_BOP_API_BASE=https://api.example.com`
(or set the URL in *Server settings*) and allow the studio's origin on the
server with `BOP_CORS_ORIGINS`.

## License

Copyright (C) 2026 Robert Chen

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. See [LICENSE](LICENSE).
