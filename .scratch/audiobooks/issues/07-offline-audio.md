# Offline audio

Status: ready-for-agent
Blocked by: 03

Spec: [Audiobooks spec](../spec.md)

## Scope

- Saving every Track to the offline cache, with a size confirmation and progress.
- Service-worker range responses from the cache (206).
- Playback while saving is still in progress.
- Eviction through sync covers Track entries.
- Settings → This device: sizes and the storage estimate.

## Comments
