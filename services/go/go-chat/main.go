package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"chatapp/services/go/shared/platform/debug"
	"chatapp/services/go/shared/platform/socket"
)

func main() {
	// 1. Environment & Configuration
	port := os.Getenv("SERVICE_PORT")
	if port == "" {
		port = "8083"
	}
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis:6379"
	}
	nodeID, _ := os.Hostname() // Use hostname as node identity in the cluster

	addr := flag.String("addr", ":"+port, "http service address")
	flag.Parse()

	// 2. Initialize Distributed State (Redis)
	rdb := redis.NewClient(&redis.Options{
		Addr: redisURL,
	})

	// 3. Initialize Advanced Socket Hub
	hub := socket.NewHub("GO-CHAT", nodeID, rdb)
	
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go hub.Run(ctx)

	// 4. Register HTTP Routes
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		// Elite Auth Handshake (Simplified for template)
		// In production, we'd extract user_id from JWE token in cookie
		userID := r.URL.Query().Get("user_id")
		if userID == "" {
			userID = "anonymous-" + nodeID
		}
		hub.ServeWs(w, r, userID)
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// 5. Start Server with Graceful Shutdown
	srv := &http.Server{
		Addr:    *addr,
		Handler: nil,
	}

	go func() {
		debug.Print("GO-CHAT", "Elite Node operational on "+*addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			debug.Print("GO-CHAT", "Critical Failure: "+err.Error())
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	debug.Print("GO-CHAT", "Graceful shutdown initiated...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		debug.Print("GO-CHAT", "Shutdown error: "+err.Error())
	}

	debug.Print("GO-CHAT", "Service exited.")
}
