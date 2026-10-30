# Streaming and downloading audio

Status: done
Blocked by: 01

Spec: [Audiobooks spec](../spec.md)

## Scope

- `GET /api/files/:id/tracks/:position` with range requests and caching.
- `/info` with tracks and chapters.
- The download route: one Track as is, several Tracks as a stored zip built while streaming. `yazl` moves to dependencies.
- Merge and split tests with Audio Files.
- `gen:api`.

## Comments

- 2026-10-30: done.
  - **`GET /api/files/:id/tracks/:position`**: serves the Track's blob with its mime type, immutable caching and range requests (206), through the same `sendBlob` helper as ordinary Files.
  - **`GET /api/files/:id`**: an Audio File with several Tracks downloads as a stored (`compress: false`) yazl zip named `<Book title>.zip`, streamed with `no-store`. Duplicate entry names get a number in front. A single-Track Audio File is served as its Track under its original name.
  - **`/info`**: adds `duration`, `tracks[]` (with `url`), `chapters[]`, `coverUrl` and `authors`, which the player needs.
  - **Tests**: Track range, zip contents checked with yauzl, single-recording download, and a merge carrying an Audio File to another Book with its Tracks still playable.
