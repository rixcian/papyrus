# mobi/azw3 extraction and attaching Files to existing Books

Status: done
Blocked by: 03

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

PDB/EXTH extractor with cover, non-readable formats as filename-titled Books, ISBN / normalised title+author matching that attaches when the format is missing and fills only empty fields.

## Comments

- 2026-10-30: matching and filling empty fields were built in slice 03. What is left: the PDB/EXTH extractor with its cover, and tests that attach a mobi to an existing epub Book.
- 2026-10-30: done. `apps/server/src/books/mobi.ts` reads the PDB record list, record 0 (MOBI header + EXTH 100/101/103/104/105/106/112/201/202/503/524, UTF-8 or CP1252) and the cover image record, with no decompression. Tests cover attach by ISBN, attach by title + author, fill-empty-only, same-format → new Book, and no cross-Profile matching.
