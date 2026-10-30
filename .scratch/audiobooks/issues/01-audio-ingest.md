# Audio ingest

Status: done
Blocked by: none

Spec: [Audiobooks spec](../spec.md)

## Scope

- Migration `0008_audio`: `files.duration`, `file_tracks` and `file_chapters`.
- `music-metadata` extraction: tags, cover, duration, and chapters (m4b, ID3 CHAP).
- Grouping parts into Tracks and ordering them, with the Audio File identity sha256.
- Matching onto existing Books and creating new ones.
- `POST /api/uploads/audio`, and the 2048 MB default limit.
- Blob GC that counts Tracks, and Book deletion that removes Track blobs.
- Book detail: `kind`, `duration` and `trackCount`.
- Upload dialog: audio files go in one request.
- Committed fixtures and their generation script.
- Glossary already updated.

## Comments

- 2026-10-30: done.
  - **`src/books/audio.ts`**: `probeAudio` (music-metadata: tags, duration, front cover, chapters converted from `timeScale` to seconds), `orderTracks` (disc, track, natural file name), `groupTracks` (folded album; untagged together), `chaptersFor` (embedded chapters offset into Audio File time, else one per Track when there are several), `audioIdentity`, `audioExtracted`.
  - **Migration `0008_audio`**: `files.duration`, `file_tracks`, `file_chapters`. `files.format` gains `audio`, and audio extensions map to it.
  - **`Ingest.ingestAudio`/`probe`**: `Ingest.ingest` hands a single recording to it, so `/api/uploads` and the import scanner already take one mp3/m4b. `POST /api/uploads/audio` stages every part, refuses non-audio or oversized parts (discarding everything), probes, groups and ingests each group; unreadable parts come back as `failed`.
  - **`Library`**: blob GC counts Track references (`blobsOf`), plus `tracksOf`, `chaptersOf`, `trackCounts`. Split re-probes the Tracks for the new Book's metadata.
  - **Book detail Files**: `kind`, `duration`, `trackCount`. `PAPYRUS_MAX_UPLOAD_MB` defaults to 2048.
  - **Web**: the upload queue sends every audio file added together as one item to `/api/uploads/audio` and shows one result line per Audio File.
  - **Fixtures**: `src/test/fixtures/audio` (about 100 KB), from `scripts/make-audio-fixtures.sh`. 13 new tests in `src/books/audio.test.ts`. Checked that the esbuild bundle runs music-metadata.
