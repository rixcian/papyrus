# Deployment and CI: how is Papyrus packaged, configured, and released?

Type: grilling
Status: open
Blocked by: 04

## Question

Dockerfile shape (multi-stage, base image, native SQLite build, non-root user, healthcheck); volumes (DB, books, import folder) and env configuration; how DB migrations run on start; GitHub Actions workflow (lint/typecheck/test gates, build and push to GHCR on push to main and on tags, tag policy such as `latest`, semver, sha); an example docker-compose for self-hosting, including a reverse-proxy note given there is no instance auth.
