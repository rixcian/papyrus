# Sharing model: how does a Profile Share Books with another Profile?

Type: grilling
Status: resolved

## Question

What is the unit of a Share (a single Book, a shelf, a tag, the whole library)? What can the receiving Profile do with a Shared Book (read only, edit metadata, add Files, delete, re-share)? Does the recipient get their own Reading Progress, Highlights, and shelves on it? How are Shares revoked, and what happens to the recipient's reading state when they are? If two Profiles add the same file, is it one Book or two?

## Answer

- **Unit and target**: a Share covers one Book. The UI can Share many at once with multi-select. The target is either named Profiles or **everyone** (all Profiles, including ones created later). A Book is in exactly one of three states: not shared, Shared with named Profiles, or Shared with everyone. There are no "everyone except X" exclusions.
- **Recipient rights**: read, download Files, mark as an Offline Book, and put it on their own shelves. A Recipient cannot edit metadata or tags, add or remove Files, delete, or re-share. The Owning Profile's edits show up for Recipients straight away, because it is one Book. Tags are Book metadata, edited only by the Owning Profile. Shelves are each Profile's own way to organise.
- **Reading state**: Reading Progress, Bookmarks, Highlights and Notes are always per Profile and private, whoever owns the Book.
- **Revoke**: the Book disappears from the Recipient's library, and Offline copies are evicted at the next sync. The Recipient's reading state and shelf entries are **kept but hidden**, and come back if the Book is Shared again.
- **Delete**: when the Owning Profile deletes a Book, it disappears for everyone and Offline copies are evicted. All reading state and shelf entries for it are deleted, for every Profile.
- **Hide**: a Recipient can "remove from my library", which hides the Book for that Profile only and evicts its Offline copy. A "Hidden" library filter lists hidden Books, and the Recipient can unhide them.
- **Visibility**: on Book detail, the Owning Profile sees who the Book is Shared with. Recipients see "Shared by X" but not who else it is Shared with.
- **Discovery**: no notifications in v1. The library shows Books the Profile owns plus Books Shared with it that it hasn't hidden. It has a Mine / Shared with me / All filter and sorts by recently added, where a Shared Book counts as added when it was Shared with you.
- **Same file, two Profiles**: they are two separate Books. Nothing is merged and nobody is told about the other copy, which would leak a private library. A Recipient can therefore see their own *Dune* and a Shared *Dune* side by side. See [ADR 0001](../../../docs/adr/0001-books-never-merged-across-profiles.md). Deduplicating File bytes on disk is still allowed and is left to [Storage layout and import pipeline](09-storage-and-import.md).
- **Glossary**: added **Owning Profile** and **Recipient**, and tightened **Share**.
