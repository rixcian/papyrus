# Storage layout and import pipeline: how do Files land on disk and get attached to Books?

Type: grilling
Status: open
Blocked by: 03, 06

## Question

What is the on-disk layout of the books volume (content-addressed by hash vs human-readable author/title paths)? How are duplicates detected (file hash, ISBN, title+author) and how is a new File matched to an existing Book (e.g. the mobi of an epub already present)? For the watched import folder: which Profile owns imported Books, is the source moved/copied/left in place, and how are failures surfaced? What limits apply to upload size and batch size? Is there a one-off import of the existing collection that needs special handling?

Note: MOBI/azw3 files carry no series and often less metadata than an epub (see [metadata extraction](03-metadata-extraction.md)), so how a new File is matched to an existing Book decides whether it inherits the richer metadata.
