package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"chatapp/services/go/shared/platform/debug"
	"chatapp/services/go/shared/platform/messaging"
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
	kafkaBrokers := os.Getenv("KAFKA_BOOTSTRAP_SERVERS")
	if kafkaBrokers == "" {
		kafkaBrokers = "kafka:29092"
	}
	nodeID, _ := os.Hostname()

	addr := flag.String("addr", ":"+port, "http service address")
	flag.Parse()

	// 2. Initialize Infrastructure
	rdb := redis.NewClient(&redis.Options{Addr: redisURL})
	producer := messaging.NewProducer(strings.Split(kafkaBrokers, ","))
	defer producer.Close()

	// 3. Define Messaging Logic
	handler := func(client *socket.Client, payload []byte) {
		var msg socket.Message
		if err := json.Unmarshal(payload, &msg); err != nil {
			debug.Print("GO-CHAT", "Error decoding message: "+err.Error())
			return
		}

		// Route message
		if msg.Type == "chat_message" {
			// 1. Send ACK immediately
			client.Send <- []byte(`{"type":"message_ack","payload":{"original_id":"` + msg.Target + `","success":true}}`)

			// 2. Publish to Kafka for persistence and global delivery
			producer.Publish(context.Background(), messaging.Event{
				Topic:   "chat.raw",
				Key:     msg.Target, // Assuming Target is RoomID or UserID
				Type:    "CHAT_MESSAGE",
				Payload: msg.Payload,
			})
			
			debug.Print("GO-CHAT", "Message queued for delivery: "+msg.Target)
		}
	}

	// 4. Initialize Advanced Socket Hub
	hub := socket.NewHub("GO-CHAT", nodeID, rdb, handler)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go hub.Run(ctx)

	// 5. Register HTTP Routes
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
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

	// 6. Start Server
	srv := &http.Server{Addr: *addr}
	go func() {
		debug.Print("GO-CHAT", "Elite Node operational on "+*addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
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
}
