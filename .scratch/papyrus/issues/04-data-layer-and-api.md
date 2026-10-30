# Data layer and API contract: SQLite driver, ORM/migrations, typed Fastify↔React contract

Type: research
Status: open

## Question

For a Fastify + SQLite + TypeScript server in a Docker image: compare SQLite drivers (better-sqlite3, node:sqlite, libsql) on native-build friction in Docker, performance, and FTS5 support; compare query/migration tooling (Drizzle, Kysely, Prisma) on migrations, type safety, and FTS5 usability; and compare ways to share a typed contract with the React client (Fastify type providers with TypeBox/Zod + OpenAPI-generated client, ts-rest, tRPC on Fastify, Hono-style RPC alternatives). Also cover efficient file streaming/range requests for book Files in Fastify, and a data-fetching library choice for the client (TanStack Query?). Recommend a stack.
