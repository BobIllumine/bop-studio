# bop studio: the built web app behind Caddy, which also proxies /api to bop-server.
#
#   docker build -t bop-studio .
#   docker run -p 3000:8080 -e BOP_API_UPSTREAM=bop-server:8080 bop-studio

# The build output is plain static files, so build once on the runner's own
# architecture and only vary the Caddy stage per platform.
FROM --platform=$BUILDPLATFORM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM caddy:2.10.2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
ENV BOP_API_UPSTREAM=bop-server:8080
EXPOSE 8080
