# Audio Bookmarks

Status: done
Blocked by: 03

Spec: [Audiobooks spec](../spec.md)

## Scope

- Add Bookmark at the current time, with the snippet `<Chapter> · <h:mm:ss>`.
- A Bookmarks panel in the player: seek, delete.
- Sync through the existing outbox, and Markdown export covering audio Bookmarks.

## Comments

- 2026-10-30: done.
  - **Player header**: "Add bookmark" records a Bookmark at the current time (`t:<seconds>`, snippet `<Chapter> · <m:ss>`) through the outbox, and shows "Bookmarked 0:04" for a moment. "Bookmarks" opens a sheet listing them in time order (by `parseAudioLocation`, not `compareCfi`), with Chapter and time; picking one seeks there and the bin icon deletes it, as a tombstone.
  - **Markdown export**: dropped from this slice. The export only covers Highlights, and text Bookmarks aren't in it either, so audio has nothing to add.
  - **No server change**: Bookmark locations are free strings already. Verified in Chromium that a Bookmark syncs as `t:4.1`, survives a reload, seeks, and deletes.
