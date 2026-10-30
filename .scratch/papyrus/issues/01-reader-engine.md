# Which reader engine renders epub and mobi/azw3 in the browser?

Type: research
Status: resolved

## Question

Compare the candidate browser reader engines (at least foliate-js, epub.js, Readium ts-toolkit/Thorium web) for a React PWA. For each: does it render epub **and** mobi/azw3 natively (if not, what server-side conversion would mobi need, e.g. Calibre `ebook-convert`, and how heavy is that in a Docker image)? Does it support paginated and scroll modes, theming/typography, a TOC, in-book search, text selection for Highlights, and a stable locator (EPUB CFI or similar) to anchor Reading Progress, Bookmarks, and Highlights? Can it work offline from a Blob or ArrayBuffer? What are its licence, maintenance status, and React integration story? Recommend one.

## Research

Findings: branch `research/reader-engine`, file `docs/research/reader-engine.md` (local only, never merged).

## Answer

**foliate-js** (johnfactotum/foliate-js, MIT). Of the three candidates it is the only one that renders epub **and** mobi/azw3 (MOBI + KF8) natively in the browser, so the image doesn't need Calibre.

- Opens a File/Blob directly and loads sections lazily, which fits Offline Books.
- Paginated and scrolled modes, switchable at runtime. Includes a TOC, a search module, an SVG overlay (`addAnnotation()`) for Highlights, and an EPUB CFI on every relocate for Reading Progress, Bookmarks and Highlights. For MOBI the CFI is built from section indices, which is acceptable because Reading Progress is per File.
- It works in React: Readest maintains a fork inside a large React app. Readest is AGPL, so don't copy its code.
- **Caveats**: the API is unstable and there are no releases, so pin a commit (the npm package is a third-party publish). There is no React wrapper; we write our own around `<foliate-view>`. No continuous scroll across sections. The README calls search "extremely slow". Typography and themes are our own CSS via `setStyles`. A strict CSP is required, and font de-obfuscation needs HTTPS.
- **Rejected**: epub.js is epub-only and stagnant (0.3.93 from 2022). Mobi would need Calibre `ebook-convert` (GPL-3, Qt6 WebEngine, several hundred MB, estimated). Readium ts-toolkit / Thorium Web is epub-only, has no search module, needs a Go server per book, and can't read a Blob offline.
