# In-book search

Status: done
Blocked by: 09

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

foliate-js search, streamed results, progress, cancel.

## Comments

- 2026-10-30: done.
  - **Reader**: a search button (magnifier) in the top bar, plus Ctrl/Cmd+F, which also works while focus is inside the book's frame, opens a Search panel. It is a side sheet on desktop and a bottom drawer on mobile. Results stream in per chapter while "Searching… x% · N results" shows with a progress bar and Cancel. Each result shows its excerpt with the match marked, and picking one goes there. Matches are outlined on the page by foliate's overlayer.
  - **`src/reader/book-search.tsx`**: `useBookSearch` lives in the Reader, so results and outlines survive closing the panel. Cancelling bumps a run id, and the search stops at its next section. A new search waits for the previous one to stop, because foliate draws a section's matches before yielding them, and a stale run could otherwise draw over the new results. Clearing the box clears the results and outlines.
  - **foliate-js**: added types for `View.search`/`clearSearch` to `view.d.ts`. The vendored JS is unchanged.
  - **e2e**: searches "of chapter two", expects "40 results", and picks one to land in Chapter Two.
