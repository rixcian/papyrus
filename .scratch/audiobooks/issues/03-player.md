# The player

Status: ready-for-agent
Blocked by: 02

Spec: [Audiobooks spec](../spec.md)

## Scope

- `PlayerProvider`: one `<audio>` element, a global timeline across Tracks.
- The `/books/:id/listen/:fileId` page:
  - controls and a scrubber over the whole Audio File;
  - the Chapter list and previous/next Chapter;
  - speed;
  - the sleep timer, with its fade-out and rewind on resume.
- Media Session.
- Progress as `t:<seconds>` through the outbox, resuming with the rewind rule, the Reading and "Mark as finished" Read Status hooks.
- Read and Listen buttons on the Book page; tapping a cover resumes the File used last.

## Comments
