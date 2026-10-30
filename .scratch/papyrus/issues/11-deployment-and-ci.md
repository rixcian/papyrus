# Deployment and CI: how is Papyrus packaged, configured, and released?

Type: grilling
Status: open
Blocked by: 04

## Question

Dockerfile shape (multi-stage, base image, native SQLite build, non-root user, healthcheck); volumes (DB, books, import folder) and env configuration; how DB migrations run on start; GitHub Actions workflow (lint/typecheck/test gates, build and push to GHCR on push to main and on tags, tag policy such as `latest`, semver, sha); an example docker-compose for self-hosting, including a reverse-proxy note given there is no instance auth.

Also: the reader engine (foliate-js) requires a strict Content Security Policy and needs HTTPS for font de-obfuscation (see [reader engine](01-reader-engine.md)). Decide what headers the server sends and what we assume about TLS termination.
