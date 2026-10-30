# Glossary

**Book**: A single work, with one set of metadata (title, authors, cover). A Book belongs to the Profile that added it and may have several Files.
_Avoid_: title, item, ebook (when meaning the work rather than the file)

**File**: One stored copy of a Book in a specific format (e.g. the epub of a Book, the mobi of the same Book).
_Avoid_: edition, format, copy

**Profile**: A person who uses the instance, with their own Books and reading state. Profiles are picked without a password, and every Profile can do the same things.
_Avoid_: user, account, owner, admin (as a role)

**Active Profile**: The Profile currently picked on a given device or browser. Everything that device shows and records belongs to the Active Profile until someone switches.
_Avoid_: current user, logged-in profile, session

**Owning Profile**: The Profile a Book belongs to: the one that added it. Only the Owning Profile can change the Book (metadata, tags, Files), delete it, or Share it.
_Avoid_: owner (on its own), uploader

**Share**: Making one Book visible to other Profiles, either named Profiles or everyone (all Profiles, including ones created later). Without a Share, a Profile only sees its own Books. A Share lets the Recipient read; it never lets them change the Book.
_Avoid_: grant, permission

**Recipient**: A Profile that a Book is Shared with. A Recipient can read the Book, mark it as an Offline Book, put it on their own shelves, and hide it from their own library. They cannot change, delete, or re-share it.
_Avoid_: viewer, guest

**Reading Progress**: How far a Profile has got in a particular File of a Book.
_Avoid_: position, bookmark (a bookmark is a separate, deliberate marker)

**Bookmark**: A location in a File that a Profile has deliberately marked to return to.

**Highlight**: A passage in a File that a Profile has marked, in one of a fixed set of colours. Private to that Profile.

**Note**: Text a Profile attaches to a Highlight. A Note never exists without its Highlight.
_Avoid_: annotation, comment

**Offline Book**: A Book that a Profile has marked as available offline on a device, so it can be read without a connection.
_Avoid_: downloaded book, cached book
