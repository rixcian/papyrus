# foliate-js (vendored)

- Upstream: https://github.com/johnfactotum/foliate-js (MIT, see `LICENSE`)
- Pinned commit: `78914aef4466eb960965702401634c2cb348e9b1` (2026-05-01)
- Why vendored: upstream has no releases and says its API may change at any time (ticket 01).

Copied as-is: `view.js epub.js epubcfi.js mobi.js fb2.js comic-book.js fixed-layout.js paginator.js overlayer.js search.js progress.js text-walker.js tts.js vendor/zip.js vendor/fflate.js`.

Changed: `pdf.js` is replaced by a stub, because PDFs are not read in the browser and the real one pulls in ~13 MB of pdf.js.

To update: clone upstream at the new commit, copy the same files over, keep the `pdf.js` stub, update the commit above, and re-test the reader.
