# Sharing, Recipients, hide/unhide, scope filter

Status: done
Blocked by: 05

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Share state none/everyone/named, visibility rules in every query, Shared-by label, hide markers, Mine/Shared/All, revoke keeping hidden state.

## Comments

- 2026-10-30: done.
  - **Data**: migration `0005_sharing` adds `books.share_mode` (`none`/`everyone`/`named`) and `books.shared_at`, plus `book_shares` (named Recipients, with the time each was Shared) and `hidden_books`. Both cascade on Book and Profile delete.
  - **Visibility**: lives in one place, `src/books/visibility.ts`, as SQL fragments: `VISIBLE_SQL`, `HIDDEN_SQL`, `IN_LIBRARY_SQL` and `ADDED_SQL`. `Library.visibleBook` (and so every Book, File, cover, export and sync route) and `BookSearch` (listing and facets) both use them. A hidden Book stays reachable on Book detail so it can be unhidden.
  - **API**:
    - `PUT /api/books/:id/share {mode, profileIds}` is owner only. A named Share with no Profiles becomes `none`, and unknown Profiles return 400. Recipients who stay keep their original Share time.
    - `PUT /api/books/:id/hidden {hidden}` is Recipients only (409 for the owner).
    - `GET /api/books` gains `scope` (`all`/`mine`/`shared`) and `hidden=true`. Book summaries gain `sharedBy`, and `addedAt` is the Share time for Recipients, so "recently added" sorts by it.
    - Book detail gains `hidden`, plus `share` for the owner only; Recipients get `null`.
    - Facets gain `shared` and `hidden` counts.
  - **Revoke**: removes visibility only. Reading state, Read Status and the hidden marker are kept, and come back on re-Share (tested).
  - **Web**:
    - Book detail: "Share" opens a dialog (Not shared / Everyone / Only these Profiles), which refetches Profiles so new ones show up. It also shows "Shared with …" for the owner, and "Shared by X" with Hide/Unhide for Recipients.
    - Library: a "Show" filter (All / Mine / Shared with me / Hidden) appears once anything is Shared or hidden, with chips. The list layout shows "Shared by X". An empty library with hidden Books offers "Show N hidden Books".
  - **Deferred**:
    - Evicting Offline copies on revoke or hide needs Offline Books, so it goes to slice 13 (`evict[]` in sync).
    - Multi-select bulk Share and Hide need multi-select, which isn't built yet.
  - **Tests**: 10 server tests in `src/books/sharing.test.ts`. The e2e test creates Bob, has Alice Share with him by name, then has Bob see "Shared by Alice", hide the Book, find it under hidden, and unhide it.
