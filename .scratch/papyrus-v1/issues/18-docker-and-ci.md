# Docker image, compose example, CI and README

Status: done
Blocked by: 01

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Multi-stage Dockerfile, healthcheck, non-root, `docker-compose.example.yml` with Caddy, GitHub Actions CI + GHCR publish, README with the no-auth warning and backup notes.

## Comments

- 2026-10-30: done.
  - **Dockerfile**: two stages on `node:24-bookworm-slim`.
    - **Build**: corepack pnpm, then a frozen install from the manifests only (cached), then the web and server builds. `PAPYRUS_VERSION` comes in as a build arg because there is no `.git` in the context. `pnpm deploy --prod --legacy` assembles the runtime `node_modules`; only better-sqlite3 is needed, since the server is one esbuild bundle.
    - **Runtime**: `/app/{dist,drizzle,public,node_modules}`, user `node` (uid 1000), `VOLUME /data`, `EXPOSE 8080`, and a `HEALTHCHECK` that fetches `/api/health` with Node.
    - **Checked locally**: the container migrates into `/data`, serves the app with `no-cache` on `index.html` and `sw.js` and with the CSP, reports healthy, and stops on SIGTERM in about 1 s. The image is 328 MB, mostly the Node base, with 86 MB of production `node_modules`.
  - **`docker-compose.example.yml` + `Caddyfile.example`**: Papyrus is reachable only through Caddy (automatic TLS, upload timeouts and size). There is a no-login warning, a commented `basic_auth`, and commented env for the import folder and DeepL. Both are validated (`caddy validate`, `docker compose config`).
  - **CI** (`.github/workflows/ci.yml`, clean under actionlint):
    - **`check`**: install, Biome, typecheck, Vitest, build, then Playwright (Chromium) e2e, with traces uploaded on failure.
    - **`image`**: on a push to the default branch or a `v*.*.*` tag, buildx for amd64 with the GHA cache, pushed to `ghcr.io/<owner>/papyrus` tagged `main`, `sha-<short>`, `X.Y.Z`, `X.Y` and `latest`.
  - **README**:
    - Features and the no-login warning.
    - Docker, Compose and Caddy, and Tailscale Serve; why HTTPS is needed.
    - Image tags and every env var, including `PAPYRUS_DEEPL_API_KEY`.
    - The import folder and Calibre libraries; what Translation and Find online send to third parties.
    - The `/data` layout. Backups are manual because slice 17 was skipped: stop and copy, or an online `better-sqlite3` `.backup()` command, verified in the container.
    - Updating and development commands.
  - **Not done here**: there is no Git remote yet, so CI hasn't run on GitHub, and `OWNER` in the examples needs the real GHCR owner.
