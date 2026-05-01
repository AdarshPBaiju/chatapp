FROM golang:1.22-alpine AS builder

WORKDIR /src/services/go
COPY services/go/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/go-auth ./go-auth

FROM alpine:3.20

RUN adduser -D -g '' appuser
WORKDIR /app
COPY --from=builder /out/go-auth /app/go-auth
COPY services/go/go-auth/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/go-auth

USER appuser
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
