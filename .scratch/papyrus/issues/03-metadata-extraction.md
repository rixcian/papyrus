# How do we pull metadata and covers out of epub/mobi/azw3 on a Node server?

Type: research
Status: resolved

## Question

Survey Node/TypeScript options for reading metadata (title, authors, series and series index, language, identifiers such as ISBN, description, publisher, tags) and the cover image from epub (OPF) and mobi/azw3 (PDB/MOBI/EXTH headers) files on the server. Cover maintained libraries, hand-rolled parsing effort, and the Calibre CLI (`ebook-meta`) as a fallback, with its Docker image cost. Note how Calibre-style series metadata is encoded. Recommend an approach.

## Research

Findings: branch `research/metadata-extraction`, file `docs/research/metadata-extraction.md` (local only, never merged).

## Answer

Write a small in-house extractor in the server. Don't put Calibre in the image.

- **epub**: use `yauzl` (streaming zip reads) and `fast-xml-parser`. Read `container.xml`, then the OPF, then map the fields. Find the cover in this order: the `cover-image` property, `<meta name="cover">`, the guide `type=cover` entry, then any image named "cover". About 300–400 LOC.
- **mobi/azw3**: parse the PDB header, record 0 and EXTH directly, modelled on foliate-js `mobi.js` (MIT). Metadata and the cover need no decompression. The cover is the `firstImage` record (offset 0x6c) plus EXTH 201. About 150–200 LOC.
- **Series**: read EPUB 3 `belongs-to-collection` + `collection-type=series` + `group-position` first, then fall back to Calibre's EPUB 2 `calibre:series`/`calibre:series_index`. This matches Calibre's `opf3.py`. Store the index as REAL. **MOBI/azw3 cannot carry a series at all**, so series has to be editable in the UI.
- **Libraries rejected**: `epub` (julien-c) keeps only the first author and has no series. `@lingo-reader` loads whole files, writes images to disk, and its mobi metadata has no ISBN. foliate-js needs DOM globals on the server and has an EPUB 3 series bug.
- **Calibre `ebook-meta`**: about 192 MiB compressed and 653 MiB unpacked (measured for 9.17 x86_64). It needs glibc ≥ 2.34 and EGL/GL/xcb libs, and still gets no MOBI series. At most it could be an optional add-on that users enable.
