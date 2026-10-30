# Audio ingest

Status: ready-for-agent
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
