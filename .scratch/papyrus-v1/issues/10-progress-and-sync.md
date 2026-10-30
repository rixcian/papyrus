# Reading Progress, Read Status, Continue reading, HLC sync

Status: done
Blocked by: 09

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

HLC lib in shared, reading-state tables with serverSeq, `POST /api/sync`, `GET /api/files/:id/state`, outbox (online first), Jump-there toast, Read Status auto/manual, Continue reading row and Read Status filter.

## Comments

- 2026-10-30: done.
  - **Server**: `apps/server/src/sync/` holds `POST /api/sync` (push, then pull since a `serverSeq` cursor) and `GET /api/files/:id/state`. Read Status is derived on the server: progress only moves it forward (unread → reading → finished at 0.98) and only when it is newer than the current status, so a later manual status wins and rereading never un-finishes a Book. Changes stamped more than 24 h in the future are dropped. A deleted Profile answers 410 and the device drops its queue.
  - **Client**: `apps/web/src/sync/` (device id, persisted HLC clock, IndexedDB outbox keyed per record, engine). The reader records progress only after its initial navigation, so reopening a book on a stale device cannot overwrite a newer position from another device.
  - **Deviation from the spec**: the pull returns all of the Profile's reading-state changes since the cursor, not only those for Offline Books. It is a few rows per Book; slice 13 can narrow it if needed.
  - **Tests**: the server sync is covered by unit tests, the engine by tests on fake-indexeddb, and the e2e test covers two browser contexts resuming at the same chapter. The "Jump there?" toast is not exercised end to end.
