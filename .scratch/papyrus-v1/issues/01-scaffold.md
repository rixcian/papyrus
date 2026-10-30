# Monorepo scaffold, server skeleton, DB and web shell

Status: done

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

pnpm workspace (`apps/web`, `apps/server`, `packages/shared`), TS project references, Biome, Vitest. Fastify 5 with Zod type provider, config from env, security headers/CSP, `/api/health`, OpenAPI at `/api/openapi.json`, SPA static serving with cache rules. better-sqlite3 + Drizzle, migrations on start (WAL, FKs). Vite + React 19 + Tailwind v4 + coss ui base, TanStack Query, openapi-fetch client generated from the server's OpenAPI.

## Comments

- 2026-10-30: done. coss ui is **not** installed yet: the agent was not allowed to run the shadcn CLI (`pnpm dlx shadcn@latest init @coss/style`). Interim primitives built on `@base-ui/react` live in `apps/web/src/components/ui/`, so official coss components can drop in. TypeScript 7 has no JS API, so openapi-typescript runs from `tools/api-codegen` with TS 5.9.
