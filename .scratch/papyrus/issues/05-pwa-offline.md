# PWA offline: service worker tooling, where book files are stored on the device, iOS storage limits

Type: research
Status: open

## Question

For a Vite + React PWA that must read Offline Books without a connection and sync Reading Progress/Highlights on reconnect: compare service-worker tooling (vite-plugin-pwa/Workbox vs hand-written), and storage for book Files (Cache API vs IndexedDB vs OPFS) with quotas, persistence (`navigator.storage.persist`), and eviction behaviour on iOS Safari, Android Chrome, and desktop. Cover background sync availability (and fallbacks where it's missing, e.g. iOS), install prompts per platform, and update/refresh strategy for the app shell. Recommend an approach.
