# Reader: foliate-js wrapper, TOC, typography, themes, layout modes

Status: done
Blocked by: 05

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Vendor foliate-js at a pinned commit, React wrapper around `<foliate-view>`, chrome toggle, page turns, TOC panel, Aa panel with per-device-per-Profile prefs, light/sepia/dark.

## Comments

- 2026-10-30: done. foliate-js is vendored at `78914ae` in `apps/web/src/vendor/foliate-js` (see `VENDORED.md`), with a stub replacing its 13 MB pdf.js. The React wrapper is `apps/web/src/reader/foliate-reader.tsx`. Reading Progress is kept only in localStorage until slice 10 syncs it. Found and fixed while building: book stylesheets load as `blob:` URLs, so the CSP now allows `blob:` in `style-src`; foliate-js needs a named `File`, not a `Blob`; the reader is reported ready only after `view.init()`, so a TOC jump cannot be overridden by the initial navigation; a session-cache race after creating the first Profile. A Playwright smoke test (`pnpm build && pnpm e2e`) covers Profile → upload → detail → reader → TOC → theme, and fails on any console error. Wiring it into CI is slice 18.
