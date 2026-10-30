# Papyrus

Labels: wayfinder:map

## Destination

A v1 spec (`.scratch/papyrus/spec.md`) for Papyrus with every decision locked, ready to slice into implementation issues. Papyrus is a self-hosted ebook library that is also a PWA epub/mobi reader.

## Notes

- **Domain**: personal ebook library + in-browser reader. Vocabulary lives in `GLOSSARY.md` (Book, File, Profile, Share, Reading Progress, Bookmark, Highlight, Note, Offline Book); use it.
- **Skills**: grilling tickets call `grilling` + `domain-modeling`; record hard-to-reverse trade-offs as ADRs in `docs/adr/`.
- **Fixed stack**: TypeScript pnpm monorepo: `apps/web` (React, Vite, Tailwind, coss ui), `apps/server` (Fastify), `packages/shared` (API types/schemas). SQLite. Production is one Docker image (server serves the built SPA), amd64 only, built in GitHub Actions and pushed to GHCR.
- **Settled at charting**:
  - Profiles with no passwords and a profile picker; every Profile can do the same things. There is no Owner/admin.
  - **No instance authentication**: access control is the deployment's job (LAN, Tailscale, reverse-proxy auth).
  - Books belong to the Profile that added them and are private by default; they can be Shared with other Profiles.
  - One Book, many Files (epub + mobi of the same work are one Book).
  - Reader must open epub and mobi/azw3; any other file can be stored but not read in the browser.
  - Metadata comes from the file itself, plus manual editing.
  - Reader v1: TOC, typography (font/size/spacing), light/sepia/dark themes, paginated/scroll, Reading Progress, Bookmarks, in-book search, Highlights (fixed colours) with optional Notes (a Note always hangs off a Highlight; private to each Profile).
  - Library v1: authors, series (with index), tags, per-Profile shelves, metadata search/filter.
  - Ingest: multi-file web upload + a watched import folder on the server.
  - PWA: installable, with offline reading of Offline Books and progress syncing on reconnect.
- Git has no remote yet: research branches are committed locally only.

## Decisions so far

<!-- one line per resolved ticket: [title](issues/NN-slug.md): gist -->

- [What is coss ui and how does it fit a Vite + React + Tailwind app?](issues/02-coss-ui.md): adopt it. It is a shadcn-style copy-in registry on Base UI that needs Tailwind v4 and React 19 and works in Vite. Add react-virtual for the library grid; the reader view sits outside it.
- [PWA offline: service worker tooling, where book files are stored on the device, iOS storage limits](issues/05-pwa-offline.md): vite-plugin-pwa (injectManifest, prompt-for-update). Book Files go in a Cache API cache with an IndexedDB index. The app keeps its own IndexedDB outbox for sync, since Background Sync is Chromium-only. iOS users need to install to the Home Screen or Safari evicts data after 7 days.
- [Which reader engine renders epub and mobi/azw3 in the browser?](issues/01-reader-engine.md): foliate-js. It is the only option that reads epub and mobi/azw3 natively, gives CFI locators, an annotation overlay and search, and opens Blobs offline. Pin a commit, since its API is unstable, and write our own React wrapper.
- [Data layer and API contract: SQLite driver, ORM/migrations, typed Fastify↔React contract](issues/04-data-layer-and-api.md): better-sqlite3 (prebuilt binaries, FTS5 included) with Drizzle and drizzle-kit migrations that run on start. Fastify 5 uses a Zod type provider and generates OpenAPI; the client uses openapi-fetch + TanStack Query. Book Files stream through `@fastify/static` with range support.
- [How do we pull metadata and covers out of epub/mobi/azw3 on a Node server?](issues/03-metadata-extraction.md): an in-house extractor. epub uses yauzl + fast-xml-parser on the OPF; mobi/azw3 parses PDB/EXTH, modelled on foliate-js mobi.js. Series reads EPUB 3 first, then Calibre metas, stored as REAL. MOBI carries no series, so it must be editable. Calibre is rejected (about 650 MiB).
- [Sharing model: how does a Profile Share Books with another Profile?](issues/06-sharing-model.md): a Share covers one Book and goes to named Profiles or everyone. Recipients only read; reading state is always per Profile. On revoke, the Recipient's state is kept but hidden; deleting the Book removes it. Recipients can hide Books. The same file added by two Profiles makes two Books, never merged (ADR 0001).
- [Profile lifecycle: creating, switching, and deleting Profiles](issues/07-profile-lifecycle.md): anyone creates a Profile from the picker; zero Profiles shows a first-run screen. A Profile is a unique name plus a colour/initial avatar. Each device remembers its Active Profile, which is sent as a `papyrus_profile` cookie, so File URLs and offline cache entries stay Profile-independent. A Profile can rename or delete only itself, and deletion hard-deletes its Books and state.

## Not yet specified

- **Online metadata lookup** (Open Library / Google Books) for covers and descriptions: in scope, but its shape depends on the data model and import pipeline.
- **Exporting highlights** (e.g. Markdown per Book).
- **Backups**: what to back up (DB + books volume), and whether the app helps (e.g. a SQLite snapshot endpoint).
- **Search implementation**: metadata search (SQLite FTS5?) and how in-book search works, given that foliate-js's search module is reportedly very slow.
- **Testing strategy** across server, web, and reader.
- **Assembling the v1 spec**: the final ticket, once the route is clear.

## Out of scope

- OPDS feed, Send-to-Kindle, KOReader progress sync: ruled out for v1 at charting (OPDS is the first post-v1 candidate).
- Reading PDFs and comics (cbz/cbr) in the browser: they can be stored, not read.
- An instance password, user accounts, or an Owner/admin role: ruled out at charting.
- Multi-arch images: amd64 only for now.
- Sharing a whole library or a shelf in one Share, and notifications for new Shares: ruled out by [Sharing model](issues/06-sharing-model.md). v1 Shares one Book at a time, and "everyone" covers the family case.
- Transferring a deleted Profile's Books to another Profile, and uploaded avatar images: ruled out by [Profile lifecycle](issues/07-profile-lifecycle.md). Deleting a Profile hard-deletes its Books in v1.
