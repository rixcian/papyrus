# Storage layout and import pipeline: how do Files land on disk and get attached to Books?

Type: grilling
Status: resolved
Blocked by: 03, 06

## Question

What is the on-disk layout of the books volume (content-addressed by hash vs human-readable author/title paths)? How are duplicates detected (file hash, ISBN, title+author) and how is a new File matched to an existing Book (e.g. the mobi of an epub already present)? For the watched import folder: which Profile owns imported Books, is the source moved/copied/left in place, and how are failures surfaced? What limits apply to upload size and batch size? Is there a one-off import of the existing collection that needs special handling?

Note: MOBI/azw3 files carry no series and often less metadata than an epub (see [metadata extraction](03-metadata-extraction.md)), so how a new File is matched to an existing Book decides whether it inherits the richer metadata.

Note: under the [sharing model](06-sharing-model.md), duplicate detection and matching a File to an existing Book only look within the importing Profile's own Books. Books are never merged across Profiles (ADR 0001). Byte-level deduplication on disk across Profiles is still open.

## Answer

Decided by the agent: on 2026-10-30 the user handed the remaining decisions to the agent (see map Notes).

- **Volumes**: everything stateful lives under `PAPYRUS_DATA_DIR` (`/data`): `papyrus.db`, `blobs/`, `covers/`, `backups/`. The import folder is a separate mount, `PAPYRUS_IMPORT_DIR` (`/import`).
- **Layout is content-addressed**: a File's bytes are stored at `blobs/<sha256[0..2]>/<sha256>`. The original filename, extension and size live on the File row. Two Files with identical bytes, even in different Profiles, share one blob. That is invisible to Profiles (ADR 0001 allows it). A blob is deleted when no File references it any more. Covers are extracted once per Book to `covers/<bookId>.<ext>` and served as-is, with no resizing in v1.
- **Duplicates** are checked only within the importing Profile's own Books:
  1. If the hash matches one of that Profile's Files, the import is skipped and reported as "already in your library: <Book>".
  2. Otherwise the File is matched to an existing Book by **ISBN**, then by **normalised title + first author** (lowercased, punctuation and diacritics folded). It is attached only if that Book has **no File of the same format yet**. A same-format match with different bytes becomes a new Book.
  3. Otherwise a new Book is created from the File's metadata.
- **Inheriting metadata**: attaching a File never overwrites Book metadata. It only fills fields that are empty, such as a missing cover or description. That way a mobi added after its epub keeps the epub's series.
- **Fixing mistakes**: the Owning Profile can **Merge into…** another of its own Books. The Files move and the target's metadata wins. Reading state is per File, so it moves with the Files, while Read Status and shelf entries of the source are merged into the target. It can also **Split File into new Book**. Upload and import results always say whether a File made a new Book or was attached to an existing one.
- **Non-readable formats** (pdf, cbz, anything else) are stored as Files of a Book whose title comes from the filename. They can be downloaded but not read.
- **Import folder is per Profile**: `/import/<Profile name>/`. The server creates the subfolder when a Profile is created and renames it when the Profile is renamed (best effort). Files outside a Profile subfolder are ignored and reported in the server log.
- **Scanning**: a polling scan every `PAPYRUS_IMPORT_POLL_SECONDS` (default 30). Polling works on NAS and network mounts where inotify doesn't. A file is imported once its size and mtime have stayed the same for two scans. Files are processed one at a time.
- **Source files are left in place** by default. Imported paths are remembered by (path, size, mtime), so deleting the Book in the app doesn't cause a re-import. Set `PAPYRUS_IMPORT_DELETE_SOURCE=true` to remove sources after a successful import.
- **Failures** are recorded per Profile (path, error, time) and shown on an **Imports** page in settings, which also lists recent successes. A failed file is retried only when its size or mtime changes.
- **Calibre libraries**: if a folder holds a `metadata.opf`, its book files are grouped into one Book whose metadata (including series) comes from that OPF and whose cover comes from `cover.jpg`. This covers the one-off import of an existing collection: point the import folder at, or copy, a Calibre library. There is no other special one-off path.
- **Upload limits**: the client uploads **one file per request**, three at a time, so batch size has no limit. Each file is capped at `PAPYRUS_MAX_UPLOAD_MB` (default 500). Uploads go to a temp file while being hashed, so memory use stays flat.
