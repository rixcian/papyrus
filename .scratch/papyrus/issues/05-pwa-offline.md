# PWA offline: service worker tooling, where book files are stored on the device, iOS storage limits

Type: research
Status: resolved

## Question

For a Vite + React PWA that must read Offline Books without a connection and sync Reading Progress/Highlights on reconnect: compare service-worker tooling (vite-plugin-pwa/Workbox vs hand-written), and storage for book Files (Cache API vs IndexedDB vs OPFS) with quotas, persistence (`navigator.storage.persist`), and eviction behaviour on iOS Safari, Android Chrome, and desktop. Cover background sync availability (and fallbacks where it's missing, e.g. iOS), install prompts per platform, and update/refresh strategy for the app shell. Recommend an approach.

## Research

Findings: branch `research/pwa-offline`, file `docs/research/pwa-offline.md` (local only, never merged).

## Answer

- **Service worker**: vite-plugin-pwa in `injectManifest` mode with a TypeScript Workbox `sw.ts`. Keep prompt-for-update (`useRegisterSW`) so the app never reloads mid-chapter, and check for updates hourly. Fastify serves `sw.js`, `index.html` and the manifest as `no-cache`.
- **Storing book Files**: a dedicated Cache API cache keyed by File URL, served cache-first by the service worker, plus a small IndexedDB index of which Books are Offline Books. OPFS isn't worth it: we only store and read whole files, and Safari only got main-thread OPFS writes in 26.
- **Quotas**: about 60% of disk per site on Chromium and Safari 17+. Firefox allows the smaller of 10% of disk or 10 GiB unless storage is persistent. A site's storage is evicted all together, so the choice of API doesn't matter for safety.
- **Persistence**: call `navigator.storage.persist()` when a Profile marks its first Offline Book. Chrome and Safari grant it silently based on heuristics; Firefox prompts the user.
- **iOS**: Safari deletes a site's data after 7 days without a visit. Home Screen web apps are exempt in practice, so the app should push iOS users to install it.
- **Sync**: Background Sync is Chromium-only. Fallback is our own IndexedDB outbox, flushed on app start, `online`, `visibilitychange`, and `sync` where it exists. On iOS, changes sync the next time the app is open with a connection.
- **Install**: `beforeinstallprompt` works only in Chromium. Elsewhere show manual instructions (iOS Add to Home Screen, macOS Safari Add to Dock). Firefox desktop can't install PWAs.
- **Left open**: how the outbox merges across devices (goes to the reading-state model ticket), and how the active Profile is sent to the server, which affects cache keys (goes to the Profile lifecycle ticket).
