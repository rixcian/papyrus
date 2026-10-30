# Find metadata online (Open Library)

Status: done
Blocked by: 05

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Server proxy `GET /api/metadata/lookup`, candidate picker, per-field apply, cover download.

## Comments

- 2026-10-30: done.
  - **Client** (`src/metadata/openlibrary.ts`, `OpenLibrary`), with an injectable fetch, an 8 s timeout and a `User-Agent`:
    - **By ISBN**: `/isbn/<isbn>.json` (the edition: publisher, date, language, cover, work) together with `/search.json?isbn=` (authors, subjects). Falls back to the title search when Open Library doesn't know the ISBN.
    - **By title and author**: `/search.json?title=&author=` (up to 6). Descriptions come from `/works/<key>.json` (best effort), following merged-work redirects.
    - **Edition fields**: a search result is a work with every edition merged in, so publisher, language and ISBN are offered only when unambiguous. The live lookup showed the first ISBN for *The Left Hand of Darkness* was an Italian edition.
    - **Languages**: MARC codes are mapped to two-letter codes where known.
  - **API**:
    - `GET /api/metadata/lookup?isbn&title&author` returns `{candidates}`, with 502 `lookup_failed` when Open Library fails.
    - `GET /api/metadata/cover/:coverId?size=S|M|L` proxies previews. The CSP keeps `img-src 'self'`, and Open Library never sees users' IPs.
    - `PUT /api/books/:id/cover {coverId}` (owner only) downloads the large cover via `Library.replaceCover`, which drops the old file and bumps `updatedAt` so the cover URL changes.
    - Only numeric cover ids are fetched, so the endpoint can't be aimed at other URLs.
    - `PAPYRUS_OPENLIBRARY_URL` / `PAPYRUS_OPENLIBRARY_COVERS_URL` override the hosts.
  - **Web**: Edit metadata has a "Find online" button that swaps the dialog to `FindOnline`.
    - It searches by ISBN, title and author, prefilled from the form (Enter searches rather than submitting the outer form), and lists candidates with cover thumbnails.
    - Picking one shows only the fields that differ, pre-ticked where the form is empty, each showing "Now: …" or "Now empty". The cover is pre-ticked when the Book has none.
    - "Copy N into the form" fills the form. Nothing is saved until Save, which then also downloads the chosen cover; a banner offers "Keep current cover".
  - **Tests**: 6 server tests with canned responses shaped like the live ones (ISBN path with a redirected work, title fallback, ambiguous editions, unreachable, 502, cover proxy, owner-only cover). The e2e test runs `e2e/fake-openlibrary.ts` as a second Playwright web server, so it never needs the internet. A one-off check against the live Open Library confirmed the parsing.
