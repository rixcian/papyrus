# Papyrus

A self-hosted ebook library and reader for **epub**, **mobi** and **azw3**. One Docker image serves the API and the web app, which you can install on phones and computers and read offline.

- **Library**: upload or drop in books; metadata and covers are read from the files. Search, filter by author, series, tag, shelf and Read Status, in a grid or a list.
- **Reader**: themes, fonts, paginated or scrolling, contents, search inside the book, Bookmarks, Highlights with Notes, Markdown export, and translating a selection (with DeepL).
- **Profiles**: everyone in the household gets their own library, progress and highlights. Books can be Shared with other Profiles.
- **Sync**: reading position, Highlights and Bookmarks follow you between devices, and work offline.
- **Import folder**: drop files, or a whole Calibre library, into a folder and they are imported.
- **Find online**: fill in missing details and covers from Open Library.

> [!WARNING]
> **Papyrus has no login.** Profiles are for keeping libraries apart, not for security: anyone who can reach the server can open every Profile and change or delete anything. Run it on a private network (your LAN, Tailscale, a VPN), or put authentication in front of it, as in the Caddy example below.

## Running it

### Docker

```sh
docker run -d --name papyrus \
  -p 8080:8080 \
  -v papyrus-data:/data \
  ghcr.io/OWNER/papyrus:latest
```

Replace `OWNER` with the GitHub user or organisation that publishes the image. Then open <http://localhost:8080> and create the first Profile.

### Docker Compose with HTTPS

The installable app and Offline Books need HTTPS: browsers only allow service workers and offline storage on secure origins (`localhost` is the exception). The example puts [Caddy](https://caddyserver.com) in front, which gets and renews a certificate for your domain.

```sh
cp docker-compose.example.yml docker-compose.yml
cp Caddyfile.example Caddyfile   # set your domain, and optionally basic_auth
mkdir import
docker compose up -d
```

On Tailscale, `tailscale serve --bg 8080` gives you HTTPS on your tailnet without Caddy.

### Image tags

| Tag            | What                                    |
| -------------- | --------------------------------------- |
| `latest`       | The newest release                      |
| `X.Y.Z`, `X.Y` | A release                               |
| `main`         | The newest commit on the default branch |
| `sha-<commit>` | One commit                              |

Images are built for `linux/amd64`.

## Configuration

Everything is set with environment variables; all are optional.

| Variable                       | Default   |                                                                |
| ------------------------------ | --------- | -------------------------------------------------------------- |
| `PORT`                         | `8080`    | Port to listen on                                              |
| `HOST`                         | `0.0.0.0` | Address to listen on                                           |
| `PAPYRUS_DATA_DIR`             | `/data`   | Database, book files and covers. Mount a volume here.          |
| `PAPYRUS_IMPORT_DIR`           | unset     | Turns on the import folder (see below)                         |
| `PAPYRUS_IMPORT_POLL_SECONDS`  | `30`      | How often the import folder is checked                         |
| `PAPYRUS_IMPORT_DELETE_SOURCE` | `false`   | Delete files from the import folder once imported              |
| `PAPYRUS_MAX_UPLOAD_MB`        | `500`     | Largest file that can be uploaded                              |
| `PAPYRUS_TRUST_PROXY`          | `false`   | Set to `true` behind a reverse proxy                           |
| `PAPYRUS_DEEPL_API_KEY`        | unset     | Turns on translating selections in the reader                  |
| `LOG_LEVEL`                    | `info`    | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |

### Import folder

With `PAPYRUS_IMPORT_DIR=/import` (mount a host folder there), each Profile gets its own folder, `/import/<Profile name>/`. It is created with the Profile and renamed with it. Anything you put in it, in any sub-folder, is imported into that Profile's library once it has stopped changing:

- epub, mobi and azw3 become readable Books. Other files (pdf, cbz, …) are kept as downloadable Files.
- A folder containing a `metadata.opf` is treated as a Calibre book: all of its files become one Book, with the title, authors, series and tags from the OPF and the cover from `cover.jpg`. To bring in a Calibre library, copy it (or point the mount) into your Profile's folder.
- A file is imported once. Deleting the Book in Papyrus doesn't bring it back; changing the file does.
- Results and failures are listed in **Settings → Imports**.

### Translation

Selecting text in the reader offers **Translate** when `PAPYRUS_DEEPL_API_KEY` is set. Get a key at [deepl.com](https://www.deepl.com/pro-api); the free plan allows 500,000 characters a month, and its keys (ending in `:fx`) are recognised automatically. The key stays on the server. Each Profile picks its target language in the reader; Czech is the default.

The selected text is sent to DeepL. Without a key, the button doesn't appear.

### Find online

**Edit metadata → Find online** asks [Open Library](https://openlibrary.org) for details and covers, through the server. The title, author or ISBN you search for is sent to Open Library; nothing is changed until you pick what to copy and save.

## Your data and backups

Everything lives in `/data`:

| Path                            |                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `papyrus.db` (+ `-wal`, `-shm`) | The SQLite database: Profiles, Books, Shares, shelves, reading progress, Highlights |
| `blobs/`                        | Book files, stored once per content, named by their SHA-256. Never modified.        |
| `covers/`                       | Cover images                                                                        |

Papyrus doesn't make backups itself. Two ways to take one:

- **Stop and copy**: `docker compose stop papyrus`, copy the whole `/data` volume, start it again.
- **While running**: write a consistent copy of the database, then copy `/data` (the book files never change once written, so copying them while running is safe):

  ```sh
  docker compose exec papyrus node -e "require('better-sqlite3')('/data/papyrus.db', { readonly: true }).backup('/data/papyrus-backup.db').then(() => console.log('done'))"
  ```

  Back up `papyrus-backup.db` with `blobs/` and `covers/`. To restore, stop Papyrus, put the files back, and rename the backup to `papyrus.db` (removing any `papyrus.db-wal` and `papyrus.db-shm`).

Reading progress, Highlights and Bookmarks made offline live on the device until it next syncs.

## Updating

Pull the new image and restart; database migrations run on start, and the server refuses to start if one fails. Open apps show "A new version of Papyrus is ready" and reload when you choose, never in the middle of a chapter.

## Development

Requirements: Node 24 and pnpm (`corepack enable`).

```sh
pnpm install
pnpm dev          # API on :8080 and the web app on :5173 (open this one)
```

| Command          |                                                                           |
| ---------------- | ------------------------------------------------------------------------- |
| `pnpm check`     | Biome lint and format check (`pnpm format` fixes)                         |
| `pnpm typecheck` | TypeScript in every package                                               |
| `pnpm test`      | Vitest unit and API tests                                                 |
| `pnpm build`     | Build the web app and the server bundle                                   |
| `pnpm e2e`       | Playwright end-to-end test against the built app (run `pnpm build` first) |
| `pnpm gen:api`   | Regenerate the web app's API types after changing a server route          |

The service worker only runs in a production build; `pnpm dev` doesn't register it.

Layout:

- `apps/server`: Fastify API, SQLite with Drizzle migrations in `apps/server/drizzle/`.
- `apps/web`: React app (Vite), with [foliate-js](https://github.com/johnfactotum/foliate-js) vendored in `src/vendor/` for reading.
- `packages/shared`: code both sides use (sync clock, CFI ordering, limits).
- `e2e`: the Playwright test, with fake Open Library and DeepL servers so it runs offline.

The words the code and docs use (Profile, Book, File, Share, Offline Book, …) are defined in [`GLOSSARY.md`](GLOSSARY.md); decisions that are hard to reverse are in [`docs/adr/`](docs/adr/).

CI (`.github/workflows/ci.yml`) runs the checks, tests and end-to-end test on every push and pull request, and publishes the image to GHCR from the default branch and from `v*.*.*` tags.
