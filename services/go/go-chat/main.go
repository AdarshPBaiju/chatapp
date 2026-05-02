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
			// 1. Monotonic Sequencing (Phase 2.3 Requirement)
			// We use Redis INCR to ensure atomic, strictly increasing IDs per room
			roomID := msg.Target
			seqID, err := rdb.Incr(context.Background(), "room:seq:"+roomID).Result()
			if err != nil {
				debug.Print("GO-CHAT", "Redis Error (Sequencing): "+err.Error())
				return
			}

			// 2. Send ACK immediately ("Sent" tick)
			ack := map[string]any{
				"type": "message_ack",
				"payload": map[string]any{
					"temp_id":     msg.Payload.(map[string]any)["temp_id"],
					"sequence_id": seqID,
					"room_id":     roomID,
					"success":     true,
				},
			}
			ackBytes, _ := json.Marshal(ack)
			client.Send <- ackBytes

			// 3. Publish to Kafka for persistence and global delivery
			producer.Publish(context.Background(), messaging.Event{
				Topic: "chat.inbound",
				Key:   roomID,
				Type:  "CHAT_MESSAGE",
				Payload: map[string]any{
					"content":     msg.Payload.(map[string]any)["content"],
					"sender_id":   client.UserID,
					"temp_id":     msg.Payload.(map[string]any)["temp_id"],
					"sequence_id": seqID,
				},
			})
			
			debug.Print("GO-CHAT", "Message seq:"+string(rune(seqID))+" queued for room: "+roomID)
		} else if msg.Type == "read_receipt" {
			// 1. Publish to Kafka for persistence and global sync
			producer.Publish(context.Background(), messaging.Event{
				Topic: "chat.inbound",
				Key:   msg.Target, // RoomID
				Type:  "READ_RECEIPT",
				Payload: map[string]any{
					"client_id":   client.UserID,
					"sequence_id": msg.Payload.(map[string]any)["sequence_id"],
				},
			})
			debug.Print("GO-CHAT", "Read receipt received for room: "+msg.Target)
		}
	}

	// 4. Initialize Advanced Socket Hub
	hub := socket.NewHub("GO-CHAT", nodeID, rdb, handler)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go hub.Run(ctx)

	// 5. Initialize Delivery Consumer (Phase 2.2 Completion)
	deliveryConsumer := messaging.NewConsumer(strings.Split(kafkaBrokers, ","), "go-chat-group", "chat.delivery")
	defer deliveryConsumer.Close()

	go func() {
		err := deliveryConsumer.Consume(ctx, func(event messaging.Event) error {
			// Key is the target UserID
			data, _ := json.Marshal(event)
			hub.SendToUser(event.Key, data)
			return nil
		})
		if err != nil && ctx.Err() == nil {
			debug.Print("GO-CHAT", "Delivery Consumer error: "+err.Error())
		}
	}()

	// 6. Register HTTP Routes
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
