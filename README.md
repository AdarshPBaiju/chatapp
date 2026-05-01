# chatapp

## Go internal services

The repo includes a Go services workspace at [services/go/README.md](/media/adarsh/Development/chatapp/services/go/README.md:1).

- `go-auth` is the auth-focused internal service.
- `go-enrichment` is the enrichment service scaffold.
- `go-risk` is the risk scoring service scaffold.

All Go services expose `GET /health`, use versioned internal APIs under
`/api/v1/...`, and require `X-Internal-Service-Secret` for non-health routes.

The Django backend is now wired to call `go-auth` through
`GO_AUTH_VERIFY_URL` when `GO_AUTH_ENABLED=True`, with automatic fallback to the
existing Python validator if the Go verifier is unavailable.
