package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"chatapp/services/go/shared/platform/config"
	"chatapp/services/go/shared/platform/httpx"
	"chatapp/services/go/shared/platform/server"
	"github.com/redis/go-redis/v9"
)

type Location struct {
	City        string  `json:"city"`
	CountryCode string  `json:"country_code"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
}

type EnrichRequest struct {
	IP string `json:"ip"`
}

func main() {
	cfg := config.Load("go-enrichment", "8081")
	
	// Initialize Redis for caching
	redisOpts, err := redis.ParseURL(os.Getenv("REDIS_URL"))
	if err != nil {
		redisOpts = &redis.Options{Addr: "redis:6379"}
	}
	rdb := redis.NewClient(redisOpts)

	httpClient := &http.Client{Timeout: 5 * time.Second}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{Status: "ok", Message: "Healthy"})
	})

	enrichHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req EnrichRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IP == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.APIResponse{Status: "error", Message: "Invalid IP"})
			return
		}

		ctx := r.Context()
		cacheKey := "geoip:" + req.IP

		// 1. Check Cache
		if val, err := rdb.Get(ctx, cacheKey).Result(); err == nil {
			var loc Location
			if err := json.Unmarshal([]byte(val), &loc); err == nil {
				httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{Status: "ok", Data: loc})
				return
			}
		}

		// 2. Fetch from IP-API
		resp, err := httpClient.Get("http://ip-api.com/json/" + req.IP)
		if err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, httpx.APIResponse{Status: "error", Message: "Provider unreachable"})
			return
		}
		defer resp.Body.Close()

		var data struct {
			Status      string  `json:"status"`
			City        string  `json:"city"`
			CountryCode string  `json:"countryCode"`
			Lat         float64 `json:"lat"`
			Lon         float64 `json:"lon"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || data.Status != "success" {
			httpx.WriteJSON(w, http.StatusNotFound, httpx.APIResponse{Status: "error", Message: "IP not found"})
			return
		}

		loc := Location{
			City:        data.City,
			CountryCode: data.CountryCode,
			Latitude:    data.Lat,
			Longitude:   data.Lon,
		}

		// 3. Cache Result (Async)
		go func() {
			b, _ := json.Marshal(loc)
			rdb.Set(context.Background(), cacheKey, b, 24*time.Hour)
		}()

		httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{Status: "ok", Data: loc})
	})

	mux.Handle("POST /api/v1/enrich/ip", httpx.RequireInternalSecret(cfg.InternalServiceSecret, enrichHandler))

	srv := server.New(cfg, mux)
	log.Fatal(srv.ListenAndServe())
}
