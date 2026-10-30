# Audiobooks spec

Papyrus learns to store, stream and play audiobooks next to ebooks. Vocabulary follows [`GLOSSARY.md`](../../GLOSSARY.md) (Audio File, Track, Chapter, Reading Progress). Decided in conversation on 2026-10-30. There were no decision tickets.

## Principles

- **An audiobook is an Audio File of a Book**, not a separate kind of Book. One Book can have an epub and an m4b, and they share metadata, Shares, shelves and Read Status. A Book can also have only Audio Files.
- **No server-side conversion.** Files are stored and streamed exactly as uploaded, with no ffmpeg in the image. Metadata, chapters and duration are read with `music-metadata`, which is pure JS.
- **Reading Progress covers audio.** It is synced the same way as text progress ([ADR 0002](../../docs/adr/0002-hand-rolled-reading-state-sync.md)). Positions are never carried between the text and audio Files of one Book.

## Formats

- **Containers**: mp3, m4a, m4b (AAC), and ogg/opus. Each is stored whatever the browser can do; a Track the browser can't play shows "This device can't play this format".
- **Audio File shapes**:
  - **one Track**: an m4b with embedded chapters, or one long mp3;
  - **several Tracks**: a folder or batch of mp3/m4a files. They become one Audio File with the Tracks in order.
- **Chapters**:
  - Embedded chapters are used when present (m4b chapter atoms or the `chpl` box, mp3 ID3 CHAP frames).
  - Otherwise each Track is a Chapter, titled by its title tag or file name.
  - A single Track with no chapters has no chapter list.

## Data

The new tables go in migration `0008_audio`.

- `files.format` gains the value `audio`. `files.duration` (REAL, in seconds) is set for Audio Files.
- **`files.sha256` for an Audio File**: the sha256 of its Tracks' sha256s joined in order. It is used only to spot "already in your library", and there is no blob with that name.
- **`file_tracks`** (`file_id`, `position`, `sha256`, `container`, `mime`, `size`, `duration`, `title`, `original_name`): each Track's bytes are an ordinary content-addressed blob. Blob garbage collection must count Track references as well as File references.
- **`file_chapters`** (`file_id`, `position`, `title`, `start`): `start` is seconds from the start of the whole Audio File, not from the start of a Track.
- **Audio locations**:
  - The location string in progress and Bookmarks (the `cfi` column and field) holds `t:<seconds>`, seconds into the whole Audio File (e.g. `t:3721.4`). Tracks are mapped to a global time on the client.
  - `fraction` = seconds / duration.
  - An audio Bookmark's `snippet` is `<Chapter title> · <h:mm:ss>`.

## Adding audio

- **Upload**:
  - **`POST /api/uploads/audio`** takes several audio parts in one multipart request, streamed to disk as usual.
  - **Grouping**: parts that share an album tag (or that have no album tag) become one Audio File. Tracks are ordered by disc number, then track number, then file name, with natural sort.
  - **Client**: the upload dialog sends every audio file picked or dropped together in one request, and keeps sending other formats one per request, as today.
  - **Size limit**: `PAPYRUS_MAX_UPLOAD_MB` now defaults to `2048` and applies to each part.
- **Import folder**:
  - All audio files directly inside one folder become one Audio File, grouped and ordered as for upload.
  - A Calibre book folder with audio adds it as an Audio File of that Book.
  - A folder is imported once its audio files have all stopped changing. Changing any Track re-imports that Audio File.
- **Metadata**: the title comes from the album tag, falling back to the title tag and then the folder or file name. Authors come from album artist, falling back to artist; narrators are ignored in v1. Other tags filled in are year → published date, genre → tags, and the description from a comment or `desc` atom. The cover is the first embedded picture.
- **Matching**: the same rule as ebooks, ISBN first and then title + first author ([ticket 09](../papyrus/issues/09-storage-and-import.md)). An Audio File attaches to the matching Book, or creates a new Book.
- **Merge and Split**: these work on Audio Files unchanged. Split moves the whole Audio File and never splits Tracks.

## Serving

- **`GET /api/files/:id/tracks/:position`** streams one Track with range requests, `Content-Type` set to the Track's mime type, and immutable caching, like ordinary Files.
- **`GET /api/files/:id/info`**: for audio it adds `duration`, `tracks[]` (`position`, `duration`, `mime`, `size`, `title`) and `chapters[]`.
- **`GET /api/files/:id`** (download):
  - **one Track**: the Track's bytes, under its original name;
  - **several Tracks**: a stored (uncompressed) zip built while it streams, with `yazl` moving to `dependencies`, named `<Book title>.zip`;
  - nothing extra is stored on the server.
- **Book detail**:
  - Each File carries `kind: 'text' | 'audio'`; `readable` keeps its meaning for text.
  - Audio Files carry `duration` and `trackCount`.

## Player

- **Routes**:
  - `/listen/:fileId`: the full player, next to the reader's `/read/:fileId`.
  - The Book page gets separate **Read** and **Listen** buttons. Listen is shown when an Audio File exists, and Read only when a readable text File exists.
  - Tapping a cover in the library resumes the File used most recently, text or audio.
- **Engine**:
  - A `Player` lives in an app-level provider, outside the routes, so it keeps playing while you navigate.
  - It uses one `<audio>` element, changing `src` between Tracks, and keeps a global time of `trackStart + currentTime`.
  - Seeking to a global time picks the right Track.
- **Controls**:
  - play/pause, back 15 s, forward 30 s, and a scrubber over the whole Audio File;
  - a Chapter list with the current one marked;
  - previous/next Chapter;
  - speed from 0.75× to 3× in 0.05 steps, with presets;
  - a sleep timer: 5–120 minutes or end of Chapter. It fades out over the last 10 seconds, and resuming within 5 minutes rewinds 10 seconds.
- **Speed and sleep timer** are remembered per Profile on the device, in localStorage like the translation target. They don't sync.
- **Media Session**: title, author, Chapter and cover artwork are set, with handlers for play, pause, seek back and forward, previous and next track (as Chapter), and seek to a time. `setPositionState` is kept up to date.
- **Mini-player**:
  - A bar fixed to the bottom of every page except the full player and the ebook reader, showing cover, title, Chapter, play/pause and back 15 s. Tapping it opens the full player.
  - The ebook reader hides it but doesn't pause playback.
  - Closing it (×) pauses and saves the position.
- **Progress**:
  - Saved through the existing outbox every 10 s while playing, and on pause, seek, Track change, page hide and closing.
  - **Resuming**: playback picks up where you left off, rewinding 5 s when more than 10 minutes have passed since you last listened.
  - **Finishing**: like text, the server moves Read Status forward from progress. An Audio File counts as finished when 30 s or less are left, rather than at 98%, which would leave 12 minutes of a 10-hour book. The first play sets Read Status to Reading, as opening a text File does.
- **Bookmarks**:
  - "Add Bookmark" in the player records the current time.
  - The Bookmarks list in the player shows Chapter and time, and picking one seeks to it.
  - They are synced and tombstoned the same way as text Bookmarks.
  - Highlights and Notes don't apply to audio.
- **Shared Books**: Recipients can listen, save the Book for offline use and add Bookmarks.

## Library

- An audio-only Book or a Book with an Audio File gets a headphones badge on its cover, in both the grid and the list.
- The filters get "Has audio" (`?audio=1`), with a count in the facets.
- The Continue row shows "3 h 05 m left" for a Book whose most recent File is audio.
- Book page File rows for audio read "Audiobook · 11 h 20 m · 24 Tracks · 3 h 05 m left", with the Split, Delete and Download actions as for text.

## Offline

- **Making an Audio File available offline**:
  - It saves every Track in the offline cache, with a confirmation that names the total size ("Save 812 MB on this device?") and a progress bar on the Book page and in the selection bar.
  - "Make available offline" on a Book saves all of its Files, as it does now.
- **Playing offline**: the service worker answers range requests for saved Tracks from the cache with 206 responses, so seeking works offline. Playback can begin before saving finishes, with unsaved Tracks streamed from the network.
- **Settings → This device**: lists audio sizes, and shows total use against `navigator.storage.estimate()`.

## Testing

- **Fixtures** are generated once with ffmpeg and committed (a few KB each), so tests don't need ffmpeg:
  - an m4b with three chapters;
  - three mp3 Tracks sharing an album tag, one with a cover;
  - an mp3 with no tags.
- **Unit and API tests** cover:
  - metadata, chapters, grouping and ordering;
  - matching onto an existing epub Book;
  - track range requests, and the zip download, checked against its central directory;
  - blob GC with Tracks;
  - merge and split;
  - import folder grouping;
  - sync of `t:` locations.
- **e2e**: upload the mp3 Tracks, open Listen, play, seek and change Chapter, set speed, add a Bookmark, navigate to the library (the mini-player keeps playing), then reload and resume at the saved time.

## Out of scope

- Read-along between text and audio (Whispersync).
- Server-side conversion of any kind.
- CarPlay or Android Auto.
- Zip uploads.
- Per-Book speed.
- Narrators as metadata.
- Saving offline in parts.
- Car-mode UI.
