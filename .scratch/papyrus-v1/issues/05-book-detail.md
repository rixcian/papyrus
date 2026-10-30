# Book detail, metadata editing, Files, delete

Status: done
Blocked by: 03

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Book detail page, edit form (owner only), Files list with download (`/api/files/:id` with range), remove File (deletes state for everyone), delete Book (cascade + blob GC).

## Comments

- 2026-10-30: done. Decision made while building: the last File of a Book cannot be removed (409 `last_file`); delete the Book instead. Visibility and ownership checks live in `apps/server/src/books/library.ts`, which slice 07 extends with Shares. Deleting a Profile now removes its blobs and covers too. The UI was checked by build and typecheck, not in a browser.
