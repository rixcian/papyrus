# Import folder audio, e2e and docs

Status: done
Blocked by: 01, 04, 05, 06, 07

Spec: [Audiobooks spec](../spec.md)

## Scope

- Import scanner:
  - a folder of audio becomes one Audio File;
  - a Calibre folder with audio;
  - a folder waits until all its files have stopped changing;
  - changing a Track re-imports that Audio File.
- The e2e listening journey.
- README: formats, upload size, iOS and background notes, and the env table default.

## Comments

- 2026-10-30: done.
  - **Import scanner**: audio files are collected per folder and imported a folder at a time once the folder's signature (every recording's size and mtime) is unchanged across two scans. A folder's recordings are grouped by album (`groupTracks`). In the Profile's top-level folder, untagged recordings stay apart (`untaggedApart`). A Calibre folder's OPF and cover.jpg apply to its audio too. Each recording gets its own import record. A group whose recordings changed is re-imported with `attachTo` = the Book it went to before (`Ingest.ingestAudio` gained `attachTo`), so it lands in the same Book rather than a new one. `deleteSource` removes the recordings. Two tests cover a folder that is still filling up, and loose files plus a re-import.
  - **e2e**: a second test in `e2e/smoke.spec.ts` (tests in a file run in order, so the first-run test still sees no Profiles). It covers:
    - uploading three mp3s out of order, seeing "New audiobook The Quiet Shore" and the headphones badge;
    - Book page → Listen, then play, next Chapter, pause, speed 1.5×;
    - a Bookmark, then jumping away and back to it;
    - play, then Back to the library: the mini-player keeps playing in The Lighthouse; then the Has audio filter;
    - reloading the player, which resumes at the same time and speed.
    It passed three runs in a row.
  - **README**: audiobooks in the intro and features, an "Audiobooks" section (formats, adding, Chapters, progress, offline, phones, zip download), import-folder rules, `PAPYRUS_MAX_UPLOAD_MB` defaulting to 2048, and the audio fixtures script. Background playback on iOS is marked as not yet tested.
