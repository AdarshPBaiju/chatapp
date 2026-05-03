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
    CGO_ENABLED=0 GOOS=linux go build -o /out/go-media ./go-media

FROM alpine:3.20

RUN apk --no-cache add ca-certificates ffmpeg imagemagick

RUN adduser -D -g '' appuser
WORKDIR /app
COPY --from=builder /out/go-media /app/go-media
# Optional: entrypoint script if needed
# COPY services/go/go-media/entrypoint.sh /app/entrypoint.sh
# RUN chmod +x /app/entrypoint.sh /app/go-media

USER appuser
EXPOSE 8084
ENTRYPOINT ["/app/go-media"]
