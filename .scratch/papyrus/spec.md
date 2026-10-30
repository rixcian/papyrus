# Papyrus v1 spec

Papyrus is a self-hosted ebook library that is also an installable PWA reader for epub and mobi/azw3. One Docker image serves the API and the web app. Vocabulary follows [`GLOSSARY.md`](../../GLOSSARY.md). Each section links the wayfinder ticket that holds the full decision, so this spec only gives the gist.

## Principles

- **No instance authentication.** Access control is the deployment's job (LAN, Tailscale, reverse-proxy auth). Profiles are picked without a password, and every Profile can do the same things.
- **Books are private until Shared** and are never merged across Profiles ([ADR 0001](../../docs/adr/0001-books-never-merged-across-profiles.md)).
- **Reading state is always per Profile.** It works offline and syncs with last write wins on HLC timestamps ([ADR 0002](../../docs/adr/0002-hand-rolled-reading-state-sync.md)).

## Stack

| Concern | Choice | Ticket |
| --- | --- | --- |
| Monorepo | pnpm workspace: `apps/web`, `apps/server`, `packages/shared`; TypeScript; Biome; Vitest | [11](issues/11-deployment-and-ci.md) |
| Server | Fastify 5, `@fastify/type-provider-zod` (Zod 4), `@fastify/swagger`, `@fastify/static`, `@fastify/multipart`, `@fastify/cookie` | [04](issues/04-data-layer-and-api.md) |
| DB | SQLite via better-sqlite3 (WAL, FKs on), Drizzle ORM + drizzle-kit migrations run on start, FTS5 in a custom migration | [04](issues/04-data-layer-and-api.md) |
| Client data | openapi-typescript types → openapi-fetch + TanStack Query v5 | [04](issues/04-data-layer-and-api.md) |
| UI | React 19, Vite, Tailwind v4, coss ui (Base UI, copy-in registry), `@tanstack/react-virtual` | [02](issues/02-coss-ui.md), [10](issues/10-library-and-reader-ui.md) |
| Reader | foliate-js at a pinned commit, vendored, with our own React wrapper around `<foliate-view>` | [01](issues/01-reader-engine.md) |
| Metadata | In-house extractor: epub through yauzl + fast-xml-parser, mobi/azw3 through PDB/EXTH | [03](issues/03-metadata-extraction.md) |
| PWA | vite-plugin-pwa (injectManifest, prompt-for-update), a Cache API cache for Files, an IndexedDB Offline index and outbox | [05](issues/05-pwa-offline.md) |
| Image | `node:24-bookworm-slim`, multi-stage, non-root, amd64, built in GitHub Actions and pushed to GHCR | [11](issues/11-deployment-and-ci.md) |

## Profiles ([07](issues/07-profile-lifecycle.md))

- When no Profiles exist, the app shows `/welcome`. Otherwise `/profiles` shows the picker with an "+ Add Profile" tile. Anyone can create a Profile.
- A Profile has a unique name (case-insensitive, 1–32 chars) and a colour from a fixed palette; its avatar is that colour plus the name's initial.
- The device's **Active Profile** is the `papyrus_profile=<id>` cookie (SameSite=Lax), set by `PUT /api/session/profile`. Every API call except Profile listing and creation needs it. A missing or unknown cookie returns 401 `no_active_profile`, and the client sends the user to the picker.
- Switching Profile in one tab reloads every tab, coordinated through a BroadcastChannel.
- The Active Profile can only rename itself, recolour itself, or delete itself (confirmed by typing its name). Deleting is a hard delete: every Book it owns, with its Files, Shares and everyone's state on them; all of its own reading state, shelves and hidden markers; and its membership in named Shares.

## Books, Files and storage ([09](issues/09-storage-and-import.md))

- A **Book** has: title, sort title, authors (ordered), description, language, publisher, published date, ISBN, series name, series index (REAL), tags, a cover, an Owning Profile, and added/updated timestamps.
- A **File** has: format (`epub`, `mobi`, `azw3`, `pdf`, `cbz`, `other`), original filename, size, and its blob's sha256. Only epub, mobi and azw3 are readable in the browser.
- **Storage**: blobs live at `/data/blobs/<sha[0..2]>/<sha>` and are deduplicated across Profiles, which no Profile can see. A blob is deleted when no File references it any more. Covers are stored at `/data/covers/<bookId>.<ext>` and served as-is.
- **Ingesting a File**, which runs the same way for uploads and imports:
  1. Hash it.
  2. If the Profile already has a File with that hash, report "already in your library".
  3. Otherwise extract metadata.
  4. Match it to one of the Profile's own Books by ISBN, then by normalised title + first author, but only where that Book has no File of the same format. On a match, attach the File and fill in only the Book's empty fields.
  5. Otherwise create a new Book.
- The result is always one of `created` / `attached` / `duplicate` / `failed`, and names the Book.
- **Upload**: `POST /api/uploads`, multipart, one file per request. The client runs three at a time and shows progress in the upload tray. The size limit is `PAPYRUS_MAX_UPLOAD_MB` (default 500). Uploads stream to a temp file while they are hashed.
- **Import folder**:
  - Each Profile has its own subfolder, `/import/<Profile name>/`. The server creates it when the Profile is created and renames it when the Profile is renamed.
  - The folder is polled every `PAPYRUS_IMPORT_POLL_SECONDS` (default 30). A file is imported once its size and mtime have stayed the same for two scans, one file at a time.
  - Source files are left in place unless `PAPYRUS_IMPORT_DELETE_SOURCE=true`. The server remembers what it has imported by (path, size, mtime).
  - A folder that holds a `metadata.opf` (Calibre layout) becomes one Book, with its metadata from that OPF and its cover from `cover.jpg`.
  - Failed imports are retried only when the file's size or mtime changes. Results show on the Settings → Imports page.
- **Owner-only actions**:
  - Edit metadata (including "Find online").
  - Remove a File, which deletes every Profile's reading state on it, after a generic warning.
  - Split a File into a new Book.
  - Merge into another of the Profile's own Books. The Files move, the target's metadata wins, and Read Status and shelf entries are merged.
  - Delete the Book.
  - Share.

## Library ([10](issues/10-library-and-reader-ui.md))

- The library shows the Books the Profile owns plus the Books Shared with it that it hasn't hidden.
- **Filters**: scope (Mine / Shared with me / All), Read Status, author, series, tag, shelf, Hidden. Search is FTS5 over title, authors, series, tags and description, ranked with bm25.
- **Sort**: recently added (a Shared Book counts as added when it was Shared), title, author, series. Filtering by a series sorts by series index.
- A **Continue reading** row lists Books whose Read Status is "reading", ordered by the newest Reading Progress.
- **Grid or list**, virtualised. **Multi-select** offers bulk actions: Add to shelf, Share, Make available offline, Hide, Delete. Each action is allowed only where the Profile has the right.
- **Shelves** belong to a Profile and can hold any Book visible to it, owned or Shared.

## Sharing ([06](issues/06-sharing-model.md))

- A Book is in one of three Share states: `none`, `everyone` (which includes Profiles created later), or `named` (a set of Profiles). The Owning Profile sets it with `PUT /api/books/:id/share`.
- **Recipients** can read, download, mark as an Offline Book, put the Book on their shelves, and hide or unhide it. They see "Shared by X" but not who else it is Shared with.
- **Revoking a Share** hides the Recipient's reading state and shelf entries but keeps them, so they come back if the Book is Shared again. Offline copies are evicted at the next sync.

## Reader ([01](issues/01-reader-engine.md), [08](issues/08-reading-state-model.md), [10](issues/10-library-and-reader-ui.md))

- `/read/:fileId` opens full screen. foliate-js loads the File from the Cache API when it is an Offline Book, and otherwise from `/api/files/:id`, which supports range requests.
- **Controls**: tapping the centre toggles the chrome. The edges, arrow keys and swipe turn pages.
- **Panels**: TOC, search, Aa, and annotations. Panels are side sheets on desktop and bottom drawers on mobile.
- **Aa** sets font family, size, line spacing, margins, theme (light, sepia, dark) and paginated/scroll mode. These preferences are stored in localStorage, keyed by Profile, per device, and never synced.
- **In-book search** uses foliate-js search. It runs on demand, streams its results, shows progress and can be cancelled.
- **Selection popover**: four Highlight colours (yellow, green, blue, pink), Note, Copy. Tapping a Highlight gives edit and delete. Overlapping Highlights show a picker first.

## Reading state and sync ([08](issues/08-reading-state-model.md), [05](issues/05-pwa-offline.md))

- **Records**:
  - Reading Progress: `(profileId, fileId)` → `cfi`, `fraction`, `deviceId`, `hlc`.
  - Bookmark: `id`, `fileId`, `cfi`, `snippet`, `hlc`, `deleted`.
  - Highlight: `id`, `fileId`, `cfiRange`, `colour`, `text`, `note?`, `hlc`, `deleted`.
  - Read Status: `(profileId, bookId)` → `unread`/`reading`/`finished`, `hlc`.
- **Merging**: each record is merged on its own with last write wins on HLC timestamps. Deletes are tombstones, kept indefinitely.
- **Server cursor**: the server stamps every accepted write with a monotonic `serverSeq`, which is the pull cursor.
- **Read Status** becomes `reading` once any File has progress, and `finished` at a fraction of 0.98 or more, unless the Profile has set it by hand at a later HLC.
- **Outbox**: an IndexedDB outbox records each change tagged with its `profileId`. Reading Progress keeps only the latest entry per (Profile, File).
- **Flushing**: the outbox is flushed after about 2 s of quiet, and on start, `online`, `visibilitychange`, and Background Sync where it exists.
- **`POST /api/sync`**:
  - Request: `{ profileId, changes[], cursor, offlineBookIds[] }`.
  - Response: `{ cursor, changes[] }`, where `changes` holds the newer state for the Profile's Offline Books since the cursor, plus `evict[]`, the Books this device must evict.
  - Changes for revoked or hidden Books are stored. Changes for deleted Books, Files or Profiles are dropped.
- **Opening a File** fetches `GET /api/files/:id/state`. If the server's position is newer and comes from another device, the reader shows the "Jump there?" toast.

## PWA and offline ([05](issues/05-pwa-offline.md))

- The app is installable. Chromium uses `beforeinstallprompt`; other browsers get manual instructions, and iOS gets an "add to Home Screen to keep offline books" nudge.
- **Making a Book available offline** puts its readable Files in the Cache API cache, keyed by File URL. The IndexedDB Offline index is keyed by (Profile, Book). A Profile's first Offline Book calls `navigator.storage.persist()`. A cached File is evicted only when no Profile on the device still holds that Book offline.
- Offline, the picker lists only the Profiles that have used this device.
- **Updates**: prompt-for-update, checked hourly. Settings → This device shows the storage used and the persistence state.

## Decided at assembly

These were the last "Not yet specified" items on the map. The agent decided them under the 2026-10-30 hand-off.

- **Online metadata lookup**: on the Edit metadata form, "Find online" queries **Open Library** through the server: `/search.json` by ISBN or title + author, then `/works/<key>.json` for the description and `covers.openlibrary.org` for the cover. The server proxies these as `GET /api/metadata/lookup`. The user picks a candidate and ticks which fields to apply. Nothing is applied automatically. Google Books is out of v1.
- **Exporting highlights**: `GET /api/books/:id/highlights.md` returns one Markdown file per Book for the Active Profile. It has the Book title and authors, then each File's Highlights in reading order (sorted by CFI), each followed by its Note as a blockquote. Export is offered on Book detail and in the reader's annotations panel. A library-wide view is out of v1.
- **Backups**: on start and every 24 h, the server runs `VACUUM INTO /data/backups/papyrus-<yyyy-mm-dd>.db` and keeps the last 7. Blobs are immutable, so backing up `/data` with any file-level tool is consistent. There is no backup API.
- **Search**: metadata uses SQLite FTS5 (an external-content table over books, with authors, tags and series joined into it, kept in step by triggers in a custom migration), with prefix queries and bm25. In-book search runs in the client with foliate-js, as in the Reader section.
- **Testing**:
  - Vitest in every package.
  - The server is tested through `fastify.inject` against a temp-dir SQLite and a temp data directory.
  - The extractors are tested against small epub/mobi fixtures built in the tests.
  - The client's sync, HLC and outbox logic are unit-tested with `fake-indexeddb`.
  - React components get Testing Library tests where they hold logic.
  - One Playwright smoke test (create a Profile, upload, open the reader) runs in CI after the image build. It is added with the reader slice.

## Deployment ([11](issues/11-deployment-and-ci.md))

- **Env**: `PORT` (8080), `HOST` (0.0.0.0), `PAPYRUS_DATA_DIR` (/data), `PAPYRUS_IMPORT_DIR` (unset disables importing), `PAPYRUS_IMPORT_POLL_SECONDS` (30), `PAPYRUS_IMPORT_DELETE_SOURCE` (false), `PAPYRUS_MAX_UPLOAD_MB` (500), `PAPYRUS_TRUST_PROXY` (false), `LOG_LEVEL` (info).
- **Start-up**: open the DB, migrate, start backups, start the import scanner, listen. On SIGTERM the server shuts down gracefully.
- **Security headers**: a strict CSP as written in ticket 11, `nosniff`, and `Referrer-Policy: no-referrer`.
- **Caching**: `index.html`, `sw.js` and the manifest are sent `no-cache`; hashed assets are cached as immutable.
- **TLS** is terminated upstream; HTTPS is required for the PWA everywhere except localhost. The README and `docker-compose.example.yml` (with Caddy) state that there is no built-in authentication.
- **CI**: Biome, `tsc -b` and Vitest on every push and PR. Pushes to `main` publish the GHCR tags `main` and `sha-<short>`; a tag `v*.*.*` publishes `X.Y.Z`, `X.Y` and `latest`.

## Out of scope for v1

OPDS, Send-to-Kindle, KOReader sync. Reading PDFs and comics in the browser. Instance passwords, accounts and admin roles. Multi-arch images. Sharing a shelf or a whole library, and notifications for new Shares. Transferring Books when a Profile is deleted, and uploaded avatars. A library-wide highlights view, Google Books, and cover resizing.

## Implementation slices

The vertical slices, in build order, are issues under [`.scratch/papyrus-v1/issues/`](../papyrus-v1/issues/).
