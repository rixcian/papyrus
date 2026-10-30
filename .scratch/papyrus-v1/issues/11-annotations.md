# Bookmarks, Highlights, Notes, annotations panel, Markdown export

Status: done
Blocked by: 10

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Selection popover, four colours, overlapping-highlight picker, bookmark toggle, annotations panel, tombstones, `GET /api/books/:id/highlights.md`.

## Comments

- 2026-10-30: done.
  - **Server**: Bookmarks and Highlights are two more kinds in `POST /api/sync`. Records use client ids and are never overwritten across Profiles. Deletes are tombstones. `GET /api/books/:id/highlights.md` exports in reading order using `compareCfi` from `packages/shared/src/cfi.ts`.
  - **Client**: an `annotations` IndexedDB store (DB version 2) holds local and pulled records, so Highlights show offline and arrive on a new device with its first sync. The reader draws them with the foliate Overlayer and redraws them on `create-overlay`. It has selection and Highlight toolbars, an overlap picker, a Note dialog, a bookmark toggle and an annotations panel that exports after flushing the outbox.
  - **e2e**: a real text selection → Note → bookmark → panel → exact Markdown export.
