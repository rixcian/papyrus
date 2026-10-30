# Mini-player

Status: done
Blocked by: 03

Spec: [Audiobooks spec](../spec.md)

## Scope

- The bottom bar on every page except the full player and the ebook reader, which keeps playing across navigation.
- Closing it pauses and saves the position.
- Layout that stays out of the way of the selection bar and of safe-area insets.
- Switching Profile stops playback.

## Comments

- 2026-10-30: done.
  - **`components/mini-player.tsx`**:
    - Rendered by `AppShell`, so the library, Book page and Settings show it, while `/read` and `/listen` (outside the shell) don't.
    - Shows a thin progress line, a cover thumbnail, the title and Chapter (or the error) linking to `/listen/:fileId`, back 15 s, play/pause, and close (saves and stops).
  - **Layout**: while it shows, `--player-offset` is set on `<html>`. The selection bar and the upload tray sit above it, and `main` gets extra bottom padding.
  - **Stopping**: `Player.attach()` returns its own teardown: it saves, stops and removes the `pagehide`/`visibilitychange` listeners. `PlayerProvider` runs it in an effect, so leaving for the Profile picker (outside `RequireProfile`) stops playback, and StrictMode's remount re-attaches cleanly. A Profile switch reloads every tab anyway.
  - **Verified in Chromium**: play, back to the Book page, then the library. The mini-player keeps playing, opens the full player at the right time, and closing it hides it, with no console errors.
