# Data layer and API contract: SQLite driver, ORM/migrations, typed Fastify↔React contract

Type: research
Status: resolved

## Question

For a Fastify + SQLite + TypeScript server in a Docker image: compare SQLite drivers (better-sqlite3, node:sqlite, libsql) on native-build friction in Docker, performance, and FTS5 support; compare query/migration tooling (Drizzle, Kysely, Prisma) on migrations, type safety, and FTS5 usability; and compare ways to share a typed contract with the React client (Fastify type providers with TypeBox/Zod + OpenAPI-generated client, ts-rest, tRPC on Fastify, Hono-style RPC alternatives). Also cover efficient file streaming/range requests for book Files in Fastify, and a data-fetching library choice for the client (TanStack Query?). Recommend a stack.

## Research

Findings: branch `research/data-layer-and-api`, file `docs/research/data-layer-and-api.md` (local only, never merged).

## Answer

- **SQLite driver**: better-sqlite3 13.0.3. Prebuilt binaries for linux glibc/musl x64/arm64 ship inside the package with no install script, so the Docker image needs no compiler (verified by unpacking it). The bundled SQLite 3.53.4 includes FTS5.
- **Queries and migrations**: Drizzle ORM 0.45.4 (stable) plus drizzle-kit. Migration SQL is generated from the TS schema and applied with `migrate()` on server start. FTS5 (external-content table, triggers, `bm25`/`snippet`) lives in a hand-written custom migration and is queried through Drizzle's `sql` template.
- **Typed contract**: Fastify 5 with `@fastify/type-provider-zod` (Zod 4) and `@fastify/swagger`. The generated OpenAPI feeds `openapi-typescript`, and the client uses `openapi-fetch` + `openapi-react-query`. TypeBox is an equally official alternative.
- **Streaming Files**: `@fastify/static` `reply.sendFile()` with `serve: false`, after checking that the Profile owns the Book or has a Share. Range requests, ETag and conditional GET are on by default.
- **Client data fetching**: TanStack Query v5. Its `networkMode` suits the offline PWA.
- **Ruled out**: ts-rest (archived), Prisma (no SQLite full-text search, major version in RC), libsql (no benefit for a single container), tRPC (RPC-style, file streaming falls outside it), Hono RPC (Hono servers only).
- **Watch**: `node:sqlite` is now RC (Node v24.15 / v25.7) with FTS5. Consider switching once Drizzle 1.0, which supports it, is stable. Benchmark it first.
