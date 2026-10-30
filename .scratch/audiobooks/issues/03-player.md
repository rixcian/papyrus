# The player

Status: done
Blocked by: 02

Spec: [Audiobooks spec](../spec.md)

## Scope

- `PlayerProvider`: one `<audio>` element, a global timeline across Tracks.
- The `/listen/:fileId` page:
  - controls and a scrubber over the whole Audio File;
  - the Chapter list and previous/next Chapter;
  - speed;
  - the sleep timer, with its fade-out and rewind on resume.
- Media Session.
- Progress as `t:<seconds>` through the outbox, resuming with the rewind rule, the Reading and "Mark as finished" Read Status hooks.
- Read and Listen buttons on the Book page; tapping a cover resumes the File used last.

## Comments

- 2026-10-30: done.
  - **`src/player/timeline.ts`** (tested): Track and offset for a global time, Chapter lookup, previous/next Chapter (previous goes to the start of the current Chapter unless that was under 3 s ago), `formatClock`/`formatLength`, the `t:<seconds>` location, and the 5 s rewind after a break of more than 10 minutes.
  - **`src/player/player.ts`**:
    - The `Player` class drives one `<audio>` element. It swaps `src` between Tracks, and seeking waits for `loadedmetadata`.
    - `playing` reflects intent at once. Speed is saved per Profile in localStorage.
    - Sleep timer: minutes, or the end of the Chapter at the current speed. It fades out over the last 10 s, and pressing play within 5 minutes rewinds 10 s.
    - Media Session: metadata follows the Chapter; play, pause, seek, previous/next Chapter and seek-to are handled.
    - Progress is saved through `syncEngine.record` on play, pause, seek, Track change, every 10 s, `pagehide` and when the page is hidden. Nothing is saved until the starting position is in place.
  - **`src/player/provider.tsx`**: `PlayerProvider`, mounted in `RequireProfile` around the routes; `usePlayer` and `usePlayerState` (`useSyncExternalStore`).
  - **`src/pages/listen.tsx`**:
    - `/listen/:fileId` resumes from the newer of this device's progress and the server's.
    - Controls: cover, Chapter, scrubber with elapsed and remaining time at the current speed, previous/back 15/play/forward 30/next, and Space and the arrow keys.
    - Menus: a speed menu (presets ±0.05), a sleep menu, and a Chapters sheet.
  - **Server**:
    - An Audio File is finished at ≤ 30 s left (`AUDIO_FINISHED_WITHIN_SECONDS`), tested.
    - `lastRead` on Book summaries gains `kind` and `duration`.
    - The Continue row links audio to `/listen/…`. The Book page has Read and Listen buttons; the one used last is primary, and Listen shows the time left.
  - **Verified in Chromium** against the built app with a throwaway Playwright probe, not committed; the real e2e test is slice 08. It checked:
    - play, next Chapter, speed 2× and picking a Chapter;
    - playing across Track boundaries to the end;
    - the sleep timer stopping at the end of the Chapter (0:04);
    - reloading and resuming at 0:04.
