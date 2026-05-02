FROM golang:1.22-alpine AS builder

WORKDIR /app

# 1. Copy the module files
COPY services/go/go.mod services/go/go.sum* ./

# 2. Copy the source code (needed for go mod tidy)
COPY services/go/shared ./shared
COPY services/go/go-chat ./go-chat

# 3. Resolve dependencies
RUN go mod tidy
RUN go mod download

# 4. Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o go-chat-bin ./go-chat/main.go

# Final stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates wget
WORKDIR /root/
COPY --from=builder /app/go-chat-bin .

EXPOSE 8083
CMD ["./go-chat-bin"]
