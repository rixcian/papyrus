# Library search, filters, facets, sort, virtualised grid/list

Status: done
Blocked by: 03

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

FTS5 custom migration with triggers, `GET /api/books` filters/sort/cursor, facets endpoint, sidebar/sheet filters, grid/list toggle, react-virtual.

## Comments

- 2026-10-30: done.
  - **Server**: migration `0004_search` adds `books_fts` (FTS5, `unicode61 remove_diacritics 2`, prefix indexes), one row per Book with authors, series and tags joined in. Triggers on `books`, `book_authors` and `book_tags` rebuild a Book's row, and the migration backfills existing Books. It is a plain FTS5 table keyed by an UNINDEXED `book_id` rather than external content: `books` has a text key, and its implicit rowid can change on VACUUM. `src/books/search.ts` (`BookSearch`) does the filtering, sorting and paging in one SQL query. Search terms are quoted prefix terms, so nothing typed is read as FTS syntax. Ranking is bm25 weighted title > authors > series > tags > description.
  - **API**: `GET /api/books` takes `q`, `status`, `author`, `series`, `tag`, `sort` (`added`/`title`/`author`/`series`/`recent`/`relevance`), `cursor` and `limit`, and returns `{books, total, nextCursor}`. The cursor is an opaque offset. The default sort is relevance with a query, series index within a series, otherwise recently added. `GET /api/books/facets` lists authors, series and tags with counts.
  - **Client**: search, filters and sort live in the URL. Search is debounced. Filters are a sidebar at `lg` and up, and a left sheet below that, with filter chips. The grid or list is virtualised with `@tanstack/react-virtual` (window scroller, column count from width) and pages in through an infinite query. Placeholders fill rows that aren't loaded yet. "Continue reading" is its own query (`status=reading&sort=recent`).
  - **Not here**: the scope filter (Mine / Shared with me / All) and Hidden come with slice 07, and Shelves with slice 08. `BookSearch.visible()` is the single place sharing widens.
  - **Checked**: 11 server tests; the e2e test searches, filters by tag and switches to the list layout. A throwaway run with 250 Books kept about 50 in the DOM, reached the last Book by scrolling, and looked right at 390px wide.
