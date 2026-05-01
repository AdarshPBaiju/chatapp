# Go Services Workspace

This workspace is the foundation for internal Go services that complement the
Django backend for high-throughput or concurrency-heavy workloads.

## Layout

- `go-auth/`: internal auth-focused service skeleton
- `go-enrichment/`: internal enrichment service skeleton
- `go-risk/`: internal risk scoring service skeleton
- `shared/`: stable shared utilities for HTTP, config, and internal auth

## Conventions

- Each service exposes `GET /health`.
- Each service exposes a versioned internal API under `/api/v1/...`.
- Internal APIs require `X-Internal-Service-Secret`.
- Error responses always include a machine-readable `error_code`.

## Build

Examples:

```bash
docker compose build go-auth
docker compose build go-enrichment
docker compose build go-risk
```

## Run

Services are attached to the existing internal Compose network and are not
published externally by default.
