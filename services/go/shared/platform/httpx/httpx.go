package httpx

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type APIResponse struct {
	Status    string      `json:"status"`
	Message   string      `json:"message"`
	ErrorCode string      `json:"error_code,omitempty"`
	Data      interface{} `json:"data,omitempty"`
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func WriteJSON(w http.ResponseWriter, statusCode int, payload APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{w, http.StatusOK}
		next.ServeHTTP(rw, r)
		duration := time.Since(start)

		log.Printf(
			"[%s] %s %s | Status: %d | Duration: %v | IP: %s",
			r.Method,
			r.URL.Path,
			r.Proto,
			rw.statusCode,
			duration,
			r.RemoteAddr,
		)
	})
}

func RequireInternalSecret(expected string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if expected == "" {
			WriteJSON(w, http.StatusServiceUnavailable, APIResponse{
				Status:    "error",
				Message:   "Internal service secret is not configured.",
				ErrorCode: "INTERNAL_SECRET_NOT_CONFIGURED",
			})
			return
		}

		got := strings.TrimSpace(r.Header.Get("X-Internal-Service-Secret"))
		if got == "" || got != expected {
			WriteJSON(w, http.StatusUnauthorized, APIResponse{
				Status:    "error",
				Message:   "Invalid internal service credentials.",
				ErrorCode: "INTERNAL_AUTH_FAILED",
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

func RateLimitMiddleware(rdb *redis.Client, limit int, window time.Duration, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rdb == nil {
			next.ServeHTTP(w, r)
			return
		}

		ip := strings.Split(r.RemoteAddr, ":")[0]
		key := "ratelimit:" + ip

		count, err := rdb.Incr(r.Context(), key).Result()
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		if count == 1 {
			rdb.Expire(r.Context(), key, window)
		}

		if count > int64(limit) {
			WriteJSON(w, http.StatusTooManyRequests, APIResponse{
				Status:    "error",
				Message:   "Too many requests. Please slow down.",
				ErrorCode: "RATE_LIMIT_EXCEEDED",
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}
