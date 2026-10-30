# Import folder scanner, Calibre folders, Imports page

Status: done
Blocked by: 04

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Per-Profile subfolders, polling stability scan, import records, delete-source option, metadata.opf grouping, Settings → Imports.

## Comments

- 2026-10-30: done.
  - **Scanner** (`src/imports/scanner.ts`): on when `PAPYRUS_IMPORT_DIR` is set.
    - Top-level folders map to Profiles by name, case-insensitively, through `profileFolderName`, which replaces path-unsafe characters.
    - Files elsewhere are logged once.
    - Each Profile folder is walked recursively. Dotfiles, `Thumbs.db`/`desktop.ini` and `.part`/`.crdownload`/`.download`/`.tmp`/`.partial` are skipped.
    - A file is imported when its size and mtime match the previous scan, one at a time, through `Ingest`.
    - Passes never overlap. Polling starts in `onReady` and stops in `onClose`; the test harness passes `startBackground: false` and calls `app.importScanner.scan()`.
  - **Records**: migration `0007_imports` adds `import_records` (Profile, path relative to the Profile folder, size, mtime, status, Book, message, time).
    - A file with the same size and mtime is never looked at again, so deleting its Book doesn't re-import it, and a failure is retried only when the file changes.
    - Paths are relative, so renaming a Profile doesn't trigger re-imports.
  - **Calibre**: a folder holding `metadata.opf` is parsed with the new `opfMetadata` (shared with the epub OPF reader) plus `cover.jpg`. They are passed to `Ingest` as `extracted`, so every file in the folder gets the same metadata and matches one Book (non-readable formats included).
  - **Delete source**: with `PAPYRUS_IMPORT_DELETE_SOURCE=true`, sources go after any non-failed result. A Calibre folder left with only its OPF and cover is removed too.
  - **Profile folders**: created at startup and on Profile create, renamed on rename. Both are best effort and logged on failure.
  - **API/UI**: `GET /api/imports` returns `{enabled, folder, pollSeconds, records}` (last 100). Settings → Imports shows the folder, the poll interval and recent results with a badge, a link to the Book and the error, refreshing every 5 s. When the folder is off, it says how to turn it on.
  - **Tests**: 9 server tests in `src/imports/scanner.test.ts`. The e2e server now has an import dir with a 1 s poll (`PAPYRUS_E2E_*` env is fixed once in `playwright.config.ts`, because workers reload it), and the test drops a file in and follows it from Settings to the Book.
