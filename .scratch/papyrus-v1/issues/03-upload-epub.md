# Upload an epub and see it in the library

Status: done
Blocked by: 02

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Content-addressed blob store, File/Book/author/tag tables, epub extractor (OPF metadata, series, cover), ingest pipeline (hash → duplicate → match → create/attach), `POST /api/uploads` one file per request, cover serving, `GET /api/books` basic list, library grid, drag-and-drop + upload tray.

## Comments

- 2026-10-30: done. Matching by ISBN and by folded title + first author, plus the fill-empty-fields rule, are already in the ingest pipeline (`apps/server/src/books/ingest.ts`), so slice 04 only needs the mobi/azw3 extractor and attach tests. The UI was checked by build and typecheck only, not in a browser.
