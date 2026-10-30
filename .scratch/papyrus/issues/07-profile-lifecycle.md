# Profile lifecycle: creating, switching, and deleting Profiles

Type: grilling
Status: open
Blocked by: 06

## Question

How are Profiles created (from the picker, by anyone?), and what does a Profile carry (name, avatar/colour, reader preferences)? How is the active Profile remembered per device/browser, including for Offline Books? What happens to a deleted Profile's Books and to Shares from it: delete them, hand them over to another Profile, or keep them orphaned? Is there a first-run state with zero Profiles?

Also: how is the active Profile sent to the server (header, cookie, URL path)? This decides the cache keys for Offline Books in the service worker (see [PWA offline](05-pwa-offline.md)).
