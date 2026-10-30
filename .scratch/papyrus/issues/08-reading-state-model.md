# Reading-state model: how are Reading Progress, Bookmarks, and Highlights anchored and synced?

Type: grilling
Status: resolved
Blocked by: 01, 05

## Question

Given the chosen reader engine's locator format and the offline storage approach: what exactly is stored for Reading Progress, a Bookmark, a Highlight, and a Note? Is Reading Progress per Profile per File (as decided) or does it carry across Files of the same Book? How do offline edits from several devices merge (last-write-wins per record, furthest-progress-wins, ...)? What happens to anchors if a File is replaced? Are reader preferences per Profile or per device?

Note: [Profile lifecycle](07-profile-lifecycle.md) settled that the Active Profile reaches the server as a cookie, File URLs are Profile-independent, and the device's Offline index is keyed by (Profile, Book). The sync outbox must therefore tag each change with the Profile that made it, because several Profiles can share one device.

## Answer

All timestamps below are **hybrid logical clock (HLC)** timestamps, not raw device clocks. The decision against Evolu and other local-first sync libraries is in [ADR 0002](../../../docs/adr/0002-hand-rolled-reading-state-sync.md).

- **Reading Progress** is per (Profile, File): `cfi`, `fraction` (0–1), `deviceId` and `updatedAt`. No page numbers. The Book resumes the File the Profile read most recently, and the library card shows that File's progress. There is no conversion between formats.
- **Merging progress**: the server keeps the newest write. When you open a File and the server's position is newer and from another device, a non-blocking toast asks "You were at 63% on another device. Jump there?"
- **Bookmark**: `id` (client UUID), `cfi`, a text snippet captured at that spot, `createdAt`. No label.
- **Highlight**: `id` (client UUID), `cfiRange`, `colour`, the highlighted `text`, an optional `note` field and `updatedAt`. A Highlight has at most one **Note**, stored as a field on it, so deleting the Highlight deletes the Note. Highlights may overlap; they draw on top of each other, and tapping a spot with several shows a picker.
- **Merging records**: last write wins per record. Deletes are tombstones, kept indefinitely. They go away only in the existing hard deletes: Book delete, File removal, Profile delete.
- **Removing or replacing a File**: there is no "replace" in v1. Removing a File deletes all reading state on it for every Profile. The confirmation warns in general terms that progress and Highlights will be lost for everyone it's Shared with, without counts.
- **Reader preferences** (font, size, spacing, theme, paginated/scroll) are per device and Profile, kept locally and never synced. No per-Book overrides. There is no server table.
- **Read Status** (new glossary term) is per (Profile, Book): unread, reading or finished. It becomes "reading" once any File has progress and "finished" at about 98% of a File, and the Profile can override it by hand. It merges by last write wins.
- **Outbox → server**: each IndexedDB outbox entry is tagged with its `profileId`. A flush goes to `POST /api/sync`, grouped by Profile, with the `profileId` in the payload rather than read from the cookie. The outbox keeps only the latest Reading Progress per (Profile, File). Online, it flushes after about 2 seconds of quiet and on `visibilitychange`, plus the triggers from [PWA offline](05-pwa-offline.md).
- **Stale targets**: changes for a revoked or hidden Book are accepted and stored, consistent with "kept but hidden". Changes for a deleted Book, File or Profile are dropped without an error; the pull in the same sync tells the device to evict its copy.
- **Server → device**: when a File opens, the device fetches that Profile's full reading state for it. Each flush also pulls changes since the last sync for the Profile's Offline Books.
- **Browsing Highlights**: in v1, a panel inside the reader for the open Book lists its Highlights, Notes and Bookmarks, and tapping one jumps to it. A library-wide view stays with **Exporting highlights** under "Not yet specified".
