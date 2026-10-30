# Audio in the library

Status: done
Blocked by: 01

Spec: [Audiobooks spec](../spec.md)

## Scope

- The headphones badge in the grid and the list.
- The `audio` filter in `BookSearch`, with its facet count.
- The "Has audio" filter in the UI.
- Time left in the Continue row and on Audio File rows on the Book page.

## Comments

- 2026-10-30: done.
  - **Server**: `BookSearch` takes `audio` (an EXISTS on `files.format = 'audio'`) as `GET /api/books?audio=true`, and the facets gain an `audio` count (tested).
  - **Library**:
    - The `BookCover` `audio` prop draws a headphones badge in the corner, in the grid; list rows get a headphones icon after the title.
    - The Format → "Has audio" filter shows once any Book has audio, and appears as a chip.
    - The list row and the Continue row show "3 h 05 m left" for audio (`progressLabel`).
  - **Book page**:
    - An audio File row reads "Audiobook · 11 h 20 m · 24 Tracks · 3 h 05 m left" (time left only on the File used last), with Listen, Download, Split and Remove.
    - "Export highlights" is hidden on Books with no readable text File.
  - Checked with screenshots in Chromium.
