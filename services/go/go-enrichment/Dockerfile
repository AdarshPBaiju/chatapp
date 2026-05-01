FROM golang:1.22-alpine AS builder

WORKDIR /src/services/go
COPY services/go/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/go-enrichment ./go-enrichment

FROM alpine:3.20

RUN adduser -D -g '' appuser
WORKDIR /app
COPY --from=builder /out/go-enrichment /app/go-enrichment
COPY services/go/go-enrichment/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/go-enrichment

USER appuser
EXPOSE 8081
ENTRYPOINT ["/app/entrypoint.sh"]
