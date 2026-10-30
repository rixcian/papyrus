# mobi/azw3 extraction and attaching Files to existing Books

Status: ready-for-agent
Blocked by: 03

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

PDB/EXTH extractor with cover, non-readable formats as filename-titled Books, ISBN / normalised title+author matching that attaches when the format is missing and fills only empty fields.

## Comments

- 2026-10-30: matching and filling empty fields were built in slice 03. What is left: the PDB/EXTH extractor with its cover, and tests that attach a mobi to an existing epub Book.
