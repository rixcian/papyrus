# PWA install, Offline Books, offline outbox sync

Status: done
Blocked by: 10

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

vite-plugin-pwa injectManifest SW, Cache API Files, IndexedDB Offline index, persist(), offline picker, evict on sync, update prompt, install instructions, Settings → This device.

## Comments

- 2026-10-30: done.
  - **Service worker**: `apps/web/src/sw.ts`, built by vite-plugin-pwa in injectManifest mode with its own `tsconfig.sw.json`. It precaches the app shell (about 1.4 MB, including the foliate-js chunks), adds a navigation fallback to `index.html` (except `/api`), and serves `/api/files/:id` and `/api/books/:id/cover` from `papyrus-offline-v1` when they are there. It never adds to that cache itself; `?download=1` bypasses it.
  - **Updates**: prompt-for-update through `useRegisterSW` in `lib/pwa.tsx`, checked hourly. The banner shows only in the app shell, never in the reader. The manifest and icons (`public/icon.svg` and rendered PNGs) are in place, and Fastify already served `sw.js`, the manifest and `index.html` as `no-cache`.
  - **Offline Books** (`src/offline/store.ts`): IndexedDB store `offline` (DB v3), keyed by `[profileId, bookId]`, holding title, authors, cover URL and readable Files. Files and the cover go in the Cache API, keyed by File URL. A Book is recorded only after every File has downloaded. The first Offline Book calls `navigator.storage.persist()`. Cached bytes are removed only when no Profile's record still uses them (unit tested).
  - **Sync**: `POST /api/sync` takes `offlineBookIds` and returns `evict[]` (Books deleted, unshared or hidden), computed by `Library.inLibrary`. The engine sends the device's Offline Books on every sync, evicts what the server lists, and evicts everything on 410 (Profile deleted). Server and engine are both tested.
  - **Offline fallbacks**:
    - Session and Profiles are remembered in localStorage. Offline, the picker lists only Profiles used on this device.
    - The library shows this device's Offline Books.
    - Book detail shows a reduced view with Read buttons.
    - The reader resolves File info from the Offline index and always reads an Offline Book's bytes from the Cache API.
    - Queries don't retry while `navigator.onLine` is false.
  - **UI**:
    - "Make available offline" / "Available offline" on Book detail, and in the multi-select bar.
    - Settings → This device: Offline Books with sizes, Remove and Remove all, storage used and quota, persistence, version (git short sha and date, or `PAPYRUS_VERSION`), the update row, and install (Chromium prompt, or instructions for iOS, macOS Safari, Firefox and others).
    - Offline controls are hidden on insecure origins (plain HTTP other than localhost), where browsers give no Cache API or service worker.
  - **Not done**: Background Sync. The engine lives in the page (it uses localStorage), and the start, `online` and `visibilitychange` triggers already cover it. A separate iOS "add to Home Screen" nudge outside Settings was also left out; Settings explains the 7-day rule.
  - **e2e**: Alice saves a Book, goes offline, reloads, sees only the saved Book, and reads it with its Highlight. Bob saves a Shared Book, Alice unshares it, and Bob's Settings shows no Offline Books.
