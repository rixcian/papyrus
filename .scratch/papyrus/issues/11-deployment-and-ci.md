# Deployment and CI: how is Papyrus packaged, configured, and released?

Type: grilling
Status: resolved
Blocked by: 04

## Question

Dockerfile shape (multi-stage, base image, native SQLite build, non-root user, healthcheck); volumes (DB, books, import folder) and env configuration; how DB migrations run on start; GitHub Actions workflow (lint/typecheck/test gates, build and push to GHCR on push to main and on tags, tag policy such as `latest`, semver, sha); an example docker-compose for self-hosting, including a reverse-proxy note given there is no instance auth.

Also: the reader engine (foliate-js) requires a strict Content Security Policy and needs HTTPS for font de-obfuscation (see [reader engine](01-reader-engine.md)). Decide what headers the server sends and what we assume about TLS termination.

## Answer

Decided by the agent: on 2026-10-30 the user handed the remaining decisions to the agent (see map Notes).

- **Dockerfile** (multi-stage, based on `node:24-bookworm-slim`, glibc, so better-sqlite3's prebuilt binary works):
  - `deps` installs with pnpm through corepack and a cached store.
  - `build` builds `packages/shared`, `apps/web` (Vite) and `apps/server` (tsc).
  - `pnpm deploy --prod` assembles the server with its production dependencies.
  - The runtime stage copies the server bundle, the `web/dist` into `public/`, and the `drizzle/` migrations.
  - It runs as the non-root `node` user (uid 1000), `EXPOSE 8080`, with a `HEALTHCHECK` that fetches `/api/health` using Node.
  - On SIGTERM the server closes Fastify and the DB.
- **Volumes**: `/data` (DB, blobs, covers, backups) and `/import` (optional).
- **Env**: `PORT` (8080), `HOST` (0.0.0.0), `PAPYRUS_DATA_DIR` (/data), `PAPYRUS_IMPORT_DIR` (unset disables importing), `PAPYRUS_IMPORT_POLL_SECONDS` (30), `PAPYRUS_IMPORT_DELETE_SOURCE` (false), `PAPYRUS_MAX_UPLOAD_MB` (500), `PAPYRUS_TRUST_PROXY` (false), `LOG_LEVEL` (info).
- **Start-up**: open SQLite in WAL mode with foreign keys on, run Drizzle `migrate()`, then start listening. The server refuses to start if migrations fail.
- **Backups**: on start and every 24 h the server writes `VACUUM INTO /data/backups/papyrus-<date>.db` and keeps the last 7. Backing up `/data` is then safe while the app runs, because the blobs are immutable. The README documents this. There is no backup API.
- **Headers** on every response:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob: data:; media-src 'self' blob:; frame-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`. foliate-js's blob iframes inherit it, which blocks scripts inside books.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a minimal `Permissions-Policy`.
  - `sw.js`, `index.html` and the manifest are sent as `no-cache`. Hashed assets are cached as immutable.
- **TLS**: Papyrus speaks plain HTTP and assumes TLS terminates in front of it (Caddy, Traefik, Tailscale Serve). HTTPS is effectively required, because service workers and the `crypto.subtle` used for font de-obfuscation need a secure context; `localhost` is exempt. The README states that there is no instance authentication, and the compose example puts Caddy in front with a note on adding forward-auth or basic auth.
- **CI** (GitHub Actions, `.github/workflows/ci.yml`):
  - On PRs and pushes: install, `biome check`, `tsc -b` (typecheck), `vitest run`.
  - On a push to `main`: also build and push `ghcr.io/<owner>/papyrus` tagged `main` and `sha-<short>`.
  - On a tag `v*.*.*`: push `X.Y.Z`, `X.Y` and `latest`.
  - amd64 only, using `docker/build-push-action` with the GHA cache.
- **Lint/format**: Biome, one tool for both.
