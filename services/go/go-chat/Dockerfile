# syntax=docker/dockerfile:1.7
FROM golang:1.22-alpine AS builder

WORKDIR /app
ARG GOPROXY="https://proxy.golang.org|direct"
ENV GOPROXY=${GOPROXY}

RUN apk --no-cache add ca-certificates git
COPY services/go/go.mod services/go/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

COPY services/go/shared ./shared
COPY services/go/go-chat ./go-chat

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -o go-chat-bin ./go-chat/main.go

# Final stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates wget
WORKDIR /root/
COPY --from=builder /app/go-chat-bin .

EXPOSE 8083
CMD ["./go-chat-bin"]
