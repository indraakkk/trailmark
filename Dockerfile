# Dockerfile — the Trailmark app image (Bun). One image runs THREE services in
# docker-compose: `migrate` (oneshot), `server`, and `web` (Vite dev). It is the
# Docker parity of the Nix devShell's Bun toolchain — same Bun, same lockfile,
# same workspace install. Postgres + Garage are their own containers (see
# docker-compose.yml); this image is purely the JS runtime + the repo.
#
# `bun install --frozen-lockfile` reproduces bun.lock EXACTLY (the pinned Effect
# set + pg@8.21.0), so the container resolves the same deps as `nix run .#dev`.
# Source is baked in (not bind-mounted) so a reviewer gets a reproducible image
# with no host/container node_modules arch mismatch (host is darwin/arm64, the
# image is linux). Code edits → `docker compose build` to pick them up.
FROM oven/bun:1

# curl is only here so the compose healthchecks (/api/healthz) are trivial.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy ALL workspace manifests first so `bun install` is cached independently of
# source edits. Every workspace package.json must be present for the workspace
# graph (@trailmark/contract|db|server|web) to resolve.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contract/package.json packages/contract/package.json
COPY packages/db/package.json packages/db/package.json

# --ignore-scripts skips dependency postinstall hooks. One native accelerator that
# Vite pulls in (@parcel/watcher) tries to node-gyp-build in its postinstall and
# fails on this image (no C toolchain) — but it, lightningcss, and msgpackr all have
# pure-JS fallbacks the app never depends on, so skipping the hooks is both safe and
# necessary for a clean cross-platform build (the lockfile is generated on macOS).
RUN bun install --frozen-lockfile --ignore-scripts

# Now the rest of the repo (.dockerignore keeps host node_modules/.data/.git out).
COPY . .

# 3000 = bun server · 5173 = Vite dev. Compose maps the ones it exposes to the host.
EXPOSE 3000 5173

# Overridden per-service in docker-compose.yml (migrate / server / web).
CMD ["bun", "run", "--cwd", "apps/server", "start"]
