# Shelves

Status: done
Blocked by: 06

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Per-Profile shelves CRUD, add/remove (including multi-select), shelf filter.

## Comments

- 2026-10-30: done.
  - **Data**: migration `0006_shelves` adds `shelves` (per Profile, unique case-insensitive name of up to 64 chars) and `shelf_books`. Both cascade on Profile, shelf and Book delete.
  - **API** (`src/shelves/`):
    - `GET/POST /api/shelves`, `PATCH/DELETE /api/shelves/:id`, and `POST /api/shelves/:id/books {add, remove}` for bulk changes. Another Profile's shelf answers 404.
    - Added Books must be visible to the Profile.
    - `GET /api/books?shelf=` filters by shelf.
    - Book detail gains `shelves`.
    - Shelf counts and the filter go through `IN_LIBRARY_SQL`, so a revoked or hidden Shared Book drops off the shelf and comes back on re-Share (tested).
  - **Web**:
    - A Shelves section in the filters sidebar/sheet: pick a shelf to filter, "+" to create, and a ⋯ menu to rename or delete.
    - Book detail has a "Shelves" checkbox menu (with "New shelf…") and "On <shelf>" links.
    - Multi-select works by checkbox on hover (fine pointer) or long press (touch); in selection mode a tap toggles. A floating bar offers Add to shelf, Share (own Books), Hide or Unhide (Shared Books), Delete (own Books) and clear. Escape also clears.
    - `useShareBooks`, `useSetHidden` and `useDeleteBooks` now take several Books, one request per Book.
  - **Deferred**:
    - "Make available offline" in the bulk bar comes with slice 13.
    - Merging shelf entries on Book merge comes with slice 15.
    - The mobile bottom bar (Library / Shelves / Settings) from the screen outline isn't built; shelves are reached through Filters.
  - **Tests**: 5 server tests in `src/shelves/shelves.test.ts`. The e2e test multi-selects two Books onto a new shelf, filters by it, and checks Book detail. A throwaway touch run confirmed long press selects and that a tap then toggles instead of opening.
