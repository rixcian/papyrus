# Profiles: first run, picker, Active Profile cookie, rename, delete

Status: done
Blocked by: 01

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

Profile table and API (list, create, session set/get, patch me, delete me with name confirmation). `requireProfile` hook returning 401 `no_active_profile`. Web: `/welcome`, `/profiles`, avatar menu with Switch Profile, Settings → Profile, BroadcastChannel reload across tabs.
