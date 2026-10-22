# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- **Faster dataset previews.** The preview shows the server's small coloured
  images of RGB and depth frames (bop-server 0.1.3 or later) instead of
  downloading and decoding the stored files: about a tenth of the bytes. A
  stored depth file is fetched only when you hover a scene's frame for exact
  values, and the browser keeps what it has fetched.

## 0.1.2

### Added

- **Container image.** Published to GitHub Packages as
  `ghcr.io/bobillumine/bop-studio` for linux/amd64 and linux/arm64.
- **ZIP depth previews.** The dataset preview reads ZIP- and ZIPS-compressed
  depth EXRs, which bop-server now writes, as well as the RLE ones of older
  datasets.

### Fixed

- **Model previews failed after a reload.** Requests made while the page was
  loading went out before the sign-in was restored and got 401, and mesh
  previews kept that error. Requests now wait for the session first.

## 0.1.1

### Changed

- Built against bop-server 0.1.1's API contract.

## 0.1.0

First release, for bop-server API version 1.

### Added

- **Scene setup.** Bins, populations, cameras, lighting, and environment maps,
  with a live 3D preview and placement checks, exported as a run configuration.
- **Materials.** Material presets for assets and bins, with metallic and
  roughness ranges.
- **Asset library.** Upload meshes and environment maps, preview meshes, set
  units and physics, and optimize a mesh into a smaller GLB beside it.
- **Jobs.** Submit, follow, and cancel generation jobs on wgpu or BlenderProc,
  preview the rendered images, and download the dataset or its BOP export.
- **Sign-in.** OIDC sign-in (authorization code with PKCE) when the server
  accepts provider tokens, such as authentik's.
- **Deployment.** A Docker image serving the app behind Caddy, which proxies
  the API and sends a strict Content-Security-Policy. Built with bun.
