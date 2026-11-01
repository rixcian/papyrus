# syntax=docker/dockerfile:1.7
# Papyrus: one image serving the API and the web app (ticket 11).

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
# Only needed if better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /src

# Manifests first, so dependency installs are cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY tools/api-codegen/package.json tools/api-codegen/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
# Shown in Settings → This device. CI passes the release version; left empty, it is the
# package.json version and the build date (there is no .git in the build context).
ARG PAPYRUS_VERSION=
RUN PAPYRUS_VERSION=${PAPYRUS_VERSION} pnpm --filter @papyrus/web build \
  && pnpm --filter @papyrus/server build
# The server is one esbuild bundle; only better-sqlite3 (native) needs node_modules.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm --filter @papyrus/server deploy --prod --legacy /out

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PAPYRUS_DATA_DIR=/data \
    PAPYRUS_PUBLIC_DIR=/app/public
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /src/apps/server/dist ./dist
COPY --from=build /src/apps/server/drizzle ./drizzle
COPY --from=build /src/apps/web/dist ./public
RUN mkdir -p /data /import && chown node:node /data /import
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 8080}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
