package main

import (
	"log"
	"net/http"
	"time"

	authconfig "chatapp/services/go/go-auth/internal/config"
	"chatapp/services/go/go-auth/internal/handler"
	"chatapp/services/go/go-auth/internal/service"
	"chatapp/services/go/shared/platform/httpx"
	"chatapp/services/go/shared/platform/server"
)

func main() {
	cfg, err := authconfig.Load()
	if err != nil {
		log.Fatalf("load go-auth config: %v", err)
	}

	verifier, err := service.New(cfg)
	if err != nil {
		log.Fatalf("initialize go-auth verifier: %v", err)
	}
	defer verifier.Close()

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{
			Status:  "ok",
			Message: "go-auth is healthy.",
			Data: map[string]any{
				"service": cfg.Service.Name,
				"port":    cfg.Service.Port,
				"version": "v1",
				"role":    "synchronous auth helper",
			},
		})
	})

	verifyHandler := handler.NewVerifyHandler(verifier)

	// Rate Limiting: 100 requests per minute
	rateLimitedHandler := httpx.RateLimitMiddleware(verifier.Redis(), 100, 1*time.Minute, verifyHandler)

	mux.Handle("POST /api/v1/verify", httpx.RequireInternalSecret(cfg.Service.InternalServiceSecret, rateLimitedHandler))

	srv := server.New(cfg.Service, mux)
	log.Printf("%s listening on :%s", cfg.Service.Name, cfg.Service.Port)
	log.Fatal(srv.ListenAndServe())
}
