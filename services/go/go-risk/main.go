package main

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"time"

	"chatapp/services/go/shared/platform/config"
	"chatapp/services/go/shared/platform/httpx"
	"chatapp/services/go/shared/platform/server"
)

type Location struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type RiskRequest struct {
	CurrentLocation *Location `json:"current_location"`
	LastLocation    *Location `json:"last_location"`
	LastSeenAt      time.Time `json:"last_seen_at"`
}

func main() {
	cfg := config.Load("go-risk", "8082")
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{Status: "ok", Message: "Healthy"})
	})

	riskHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req RiskRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, httpx.APIResponse{Status: "error", Message: "Invalid Request"})
			return
		}

		if req.CurrentLocation == nil || req.LastLocation == nil || req.LastSeenAt.IsZero() {
			httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{Status: "ok", Data: map[string]int{"risk_score": 0}})
			return
		}

		dist := calculateDistance(
			req.CurrentLocation.Latitude, req.CurrentLocation.Longitude,
			req.LastLocation.Latitude, req.LastLocation.Longitude,
		)

		if dist < 10 {
			httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{Status: "ok", Data: map[string]int{"risk_score": 0}})
			return
		}

		hours := time.Since(req.LastSeenAt).Hours()
		speed := dist / math.Max(hours, 0.001)

		score := 0
		if speed > 800 {
			score = 80 // Impossible
		} else if speed > 400 {
			score = 40 // Suspicious
		}

		httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{Status: "ok", Data: map[string]int{"risk_score": score}})
	})

	mux.Handle("POST /api/v1/score/login", httpx.RequireInternalSecret(cfg.InternalServiceSecret, riskHandler))

	srv := server.New(cfg, mux)
	log.Fatal(srv.ListenAndServe())
}

func calculateDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * (math.Pi / 180.0)
	dLon := (lon2 - lon1) * (math.Pi / 180.0)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180.0))*math.Cos(lat2*(math.Pi/180.0))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}
