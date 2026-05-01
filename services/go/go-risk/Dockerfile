FROM golang:1.22-alpine AS builder

WORKDIR /src/services/go
COPY services/go/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/go-risk ./go-risk

FROM alpine:3.20

RUN adduser -D -g '' appuser
WORKDIR /app
COPY --from=builder /out/go-risk /app/go-risk
COPY services/go/go-risk/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/go-risk

USER appuser
EXPOSE 8082
ENTRYPOINT ["/app/entrypoint.sh"]
