# Reading-state model: how are Reading Progress, Bookmarks, and Highlights anchored and synced?

Type: grilling
Status: open
Blocked by: 01, 05

## Question

Given the chosen reader engine's locator format and the offline storage approach: what exactly is stored for Reading Progress, a Bookmark, a Highlight, and a Note? Is Reading Progress per Profile per File (as decided) or does it carry across Files of the same Book? How do offline edits from several devices merge (last-write-wins per record, furthest-progress-wins, ...)? What happens to anchors if a File is replaced? Are reader preferences per Profile or per device?

Note: [Profile lifecycle](07-profile-lifecycle.md) settled that the Active Profile reaches the server as a cookie, File URLs are Profile-independent, and the device's Offline index is keyed by (Profile, Book). The sync outbox must therefore tag each change with the Profile that made it, because several Profiles can share one device.
