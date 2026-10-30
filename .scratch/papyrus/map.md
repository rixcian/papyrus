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

## Not yet specified

- **Online metadata lookup** (Open Library / Google Books) for covers and descriptions: in scope, but its shape depends on the data model and import pipeline.
- **Exporting highlights** (e.g. Markdown per Book).
- **Backups**: what to back up (DB + books volume), and whether the app helps (e.g. a SQLite snapshot endpoint).
- **Search implementation**: metadata search (SQLite FTS5?) and how in-book search works given the chosen reader engine.
- **Testing strategy** across server, web, and reader.
- **Assembling the v1 spec**: the final ticket, once the route is clear.

## Out of scope

- OPDS feed, Send-to-Kindle, KOReader progress sync: ruled out for v1 at charting (OPDS is the first post-v1 candidate).
- Reading PDFs and comics (cbz/cbr) in the browser: they can be stored, not read.
- An instance password, user accounts, or an Owner/admin role: ruled out at charting.
- Multi-arch images: amd64 only for now.
