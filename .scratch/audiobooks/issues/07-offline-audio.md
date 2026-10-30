# Offline audio

Status: done
Blocked by: 03

Spec: [Audiobooks spec](../spec.md)

## Scope

- Saving every Track to the offline cache, with a size confirmation and progress.
- Service-worker range responses from the cache (206).
- Playback while saving is still in progress.
- Eviction through sync covers Track entries.
- Settings → This device: sizes and the storage estimate.

## Comments

- 2026-10-30: done.
  - **`OfflineStore`**: an `OfflineFile` can carry `audio` (duration, Tracks with URLs and sizes, Chapters). Its cache keys are the Track URLs, never `/api/files/:id`, which would be the zip. `save()` takes an `onProgress(done, total)` that counts bytes through a `TransformStream` as they reach the cache. Removing a Book and eviction already go through `keysOf`, so they cover Tracks (tested).
  - **`offlineSource`** is now async: it fetches `/info` for each Audio File. `useSaveOffline` returns `progress` across all the Books being saved.
  - **Service worker**: serves `/api/files/:id/tracks/:n` from `OFFLINE_CACHE` too, answering `Range` requests with `workbox-range-requests`' `createPartialResponse` (206). Tracks not saved yet go to the network, so playback can begin while saving.
  - **Book page**:
    - "Make available offline" on a Book with audio first asks "Save 49 KB on this device?" (its readable and Audio Files), then shows "Saving for offline… 40%" with a bar.
    - The offline Book view offers Listen for Audio Files.
  - **Selection bar**: asks first when the selection includes audiobooks, and shows the percentage while saving.
  - **Player**: `/listen/:fileId` falls back to the Offline Book's saved info when the server can't be reached.
  - **This device**: Offline Books with audio get a headphones icon. Sizes and the storage estimate were already shown.
  - **Verified in Chromium against the production build with the service worker**: save with the confirmation, go offline, open `/listen/…`, play from the cache, move between Tracks, and check that This device lists 49 KB. No console errors.
