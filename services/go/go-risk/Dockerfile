# syntax=docker/dockerfile:1.7
FROM golang:1.22-alpine AS builder

WORKDIR /src/services/go
ARG GOPROXY="https://proxy.golang.org|direct"
ENV GOPROXY=${GOPROXY}

RUN apk --no-cache add ca-certificates git
COPY services/go/go.mod services/go/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

COPY services/go/ ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -o /out/go-risk ./go-risk

FROM alpine:3.20

RUN adduser -D -g '' appuser
WORKDIR /app
COPY --from=builder /out/go-risk /app/go-risk
COPY services/go/go-risk/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/go-risk

USER appuser
EXPOSE 8082
ENTRYPOINT ["/app/entrypoint.sh"]
