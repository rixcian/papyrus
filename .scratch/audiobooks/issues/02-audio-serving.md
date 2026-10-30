# Streaming and downloading audio

Status: ready-for-agent
Blocked by: 01

Spec: [Audiobooks spec](../spec.md)

## Scope

- `GET /api/files/:id/tracks/:position` with range requests and caching.
- `/info` with tracks and chapters.
- The download route: one Track as is, several Tracks as a stored zip built while streaming. `yazl` moves to dependencies.
- Merge and split tests with Audio Files.
- `gen:api`.

## Comments
