# Merge Books and split Files

Status: done
Blocked by: 05

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Merge into another own Book (Files, Read Status, shelves move), split File into new Book.

## Comments

- 2026-10-30: done.
  - **Server** (`src/books/reshape.ts`, `Reshape`):
    - `POST /api/books/:id/merge {targetId}`: both Books must be the Profile's own and different (400 same, 404 not visible, 403 not owner).
      - Files move to the target, and Reading Progress, Bookmarks and Highlights follow because they belong to Files.
      - Every Profile's Read Status merges through `SyncService.mergeStatus` (newest HLC wins, with a new serverSeq so devices pull it), and shelf entries move.
      - The target's metadata wins; the source fills only empty fields, authors if the target has none, and a missing cover (renamed on disk).
      - The source is then deleted. The FTS triggers keep search right.
    - `POST /api/files/:id/split`: 409 for a Book's only File.
      - The new Book gets the File's own extracted metadata and cover, falling back to the original's metadata if extraction fails.
      - It copies the original's Share mode and named Shares, hidden markers, Read Statuses and shelf entries, so no Recipient loses a File.
    - `Ingest.createBook` and `saveCover` are public for this.
  - **Web**:
    - Book detail's owner actions are Edit metadata, Share, and a ⋯ "More actions" menu with "Merge into…" and Delete.
    - The Merge dialog searches the Profile's own Books (`scope=mine`).
    - Each File row has "Split" next to "Remove" when the Book has more than one File, with a non-destructive confirm (`ConfirmDialog` gained `destructive`). It navigates to the new Book.
    - `useBookMutation` takes `gone`: Books a mutation removed (delete, merge) aren't refetched, so the page leaving them no longer triggers a 404.
  - **Tests**: 4 server tests in `src/books/reshape.test.ts`: reading state and Highlights surviving a merge, cover inheritance, a Recipient's Read Status merge, permissions, and split inheritance plus the last-File guard. The e2e test merges the imported Book into Arrakis Notes and splits it back out.
