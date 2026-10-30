# Profile lifecycle: creating, switching, and deleting Profiles

Type: grilling
Status: resolved
Blocked by: 06

## Question

How are Profiles created (from the picker, by anyone?), and what does a Profile carry (name, avatar/colour, reader preferences)? How is the active Profile remembered per device/browser, including for Offline Books? What happens to a deleted Profile's Books and to Shares from it: delete them, hand them over to another Profile, or keep them orphaned? Is there a first-run state with zero Profiles?

Also: how is the active Profile sent to the server (header, cookie, URL path)? This decides the cache keys for Offline Books in the service worker (see [PWA offline](05-pwa-offline.md)).

Context: the [sharing model](06-sharing-model.md) sets Share targets as named Profiles or "everyone" (which includes Profiles created later), and says deleting a Book removes all Recipients' state for it. A deleted Profile's Books and outgoing Shares should be consistent with that.

## Answer

- **Creating**: anyone can create a Profile from an "+ Add Profile" tile on the picker, with no cap. Creating one needs a connection.
- **First run / zero Profiles**: when no Profiles exist (first start, or after the last one is deleted), the app shows a "Create your first Profile" screen (name + colour) instead of an empty picker. It leads straight into an empty library that points to upload and the import folder. There is no seed or default Profile.
- **What a Profile carries**: a **name** (unique, case-insensitive, 1–32 chars) and an **avatar**: a colour from a fixed palette plus the name's initial. No image upload in v1. Whether reader preferences are per Profile or per device is left to [Reading-state model](08-reading-state-model.md).
- **Active Profile** (new glossary term): the device/browser remembers its Active Profile. The picker only shows on first visit, after "Switch Profile", or when the remembered Profile no longer exists. Offline, the picker lists only Profiles that have used this device.
- **Sending it to the server**: a cookie, `papyrus_profile=<id>` (SameSite=Lax), set by `PUT /api/session/profile`. It reaches every request, including downloads, foliate-js range requests and service-worker fetches. It identifies; it doesn't secure: access control stays the deployment's job.
- **Offline cache keys**: File URLs stay Profile-independent (`/api/files/:id`), so the Cache API holds one copy per File per device. The IndexedDB Offline index is keyed by (Profile, Book), and a cached File is evicted only when no Profile on the device still holds it as an Offline Book.
- **Tabs**: the cookie is per browser, so switching Profile in one tab switches every tab. Open tabs learn of the switch through a BroadcastChannel and reload to the new Profile.
- **Editing**: the Active Profile can rename itself and change its colour. Shares reference the Profile id, so Recipients see "Shared by <new name>" straight away.
- **Deleting**: only the Active Profile can delete itself, from its own settings, confirmed by typing its name. It is a hard delete: every Book it owns goes through the Book-delete semantics in [Sharing model](06-sharing-model.md), so Recipients lose it and Offline copies are evicted at next sync. All its reading state, shelves and hidden markers are deleted, and it is removed from every named Share it received. Shares to "everyone" need nothing. A device whose Active Profile has been deleted falls back to the picker, and that Profile's Offline Books are evicted at next sync.
- **Ruled out for v1**: transferring a Profile's Books to another Profile on deletion (an Owning-Profile change, with edge cases when the new owner is already a Recipient), and uploaded avatar images.
