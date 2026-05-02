package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"chatapp/services/go/shared/platform/auth"
	"chatapp/services/go/shared/platform/debug"
	"chatapp/services/go/shared/platform/messaging"
	"chatapp/services/go/shared/platform/socket"
	"github.com/redis/go-redis/v9"
)

type outboundMessage struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

func sendSocketMessage(client *socket.Client, msgType string, payload any) {
	data, err := json.Marshal(outboundMessage{Type: msgType, Payload: payload})
	if err != nil {
		debug.Print("GO-CHAT", "Socket marshal error: "+err.Error())
		return
	}

	select {
	case client.Send <- data:
	default:
		debug.Print("GO-CHAT", "Socket send buffer full for user: "+client.UserID)
	}
}

func normalizeDeliveryEventType(eventType string) string {
	switch strings.ToUpper(eventType) {
	case "CHAT_DELIVERY":
		return "chat_delivery"
	case "CHAT_STATUS":
		return "chat_status"
	default:
		return strings.ToLower(eventType)
	}
}

func payloadMap(payload any) (map[string]any, bool) {
	data, ok := payload.(map[string]any)
	return data, ok
}

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
	var rdb *redis.Client
	if strings.HasPrefix(redisURL, "redis://") {
		opts, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Fatalf("failed to parse redis url: %v", err)
		}
		rdb = redis.NewClient(opts)
	} else {
		rdb = redis.NewClient(&redis.Options{Addr: redisURL})
	}
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
			body, ok := payloadMap(msg.Payload)
			if !ok {
				sendSocketMessage(client, "message_ack", map[string]any{
					"success": false,
					"error":   "Invalid message payload",
				})
				return
			}

			content, _ := body["content"].(string)
			tempID, _ := body["temp_id"].(string)
			roomID := msg.Target
			if roomID == "" || tempID == "" || strings.TrimSpace(content) == "" {
				sendSocketMessage(client, "message_ack", map[string]any{
					"temp_id": tempID,
					"success": false,
					"error":   "Room, content, and temp_id are required",
				})
				return
			}

			// 1. Monotonic Sequencing (Phase 2.3 Requirement)
			// We use Redis INCR to ensure atomic, strictly increasing IDs per room
			seqID, err := rdb.Incr(context.Background(), "room:seq:"+roomID).Result()
			if err != nil {
				debug.Print("GO-CHAT", "Redis Error (Sequencing): "+err.Error())
				sendSocketMessage(client, "message_ack", map[string]any{
					"temp_id": tempID,
					"success": false,
					"error":   "Unable to reserve message sequence",
				})
				return
			}

			// 2. Publish to Kafka for persistence and global delivery
			err = producer.Publish(context.Background(), messaging.Event{
				Topic: "chat.inbound",
				Key:   roomID,
				Type:  "CHAT_MESSAGE",
				Payload: map[string]any{
					"content":     content,
					"sender_id":   client.UserID,
					"temp_id":     tempID,
					"sequence_id": seqID,
				},
			})

			if err != nil {
				debug.Print("GO-CHAT", "Kafka Error: "+err.Error())
				sendSocketMessage(client, "message_ack", map[string]any{
					"temp_id": tempID,
					"success": false,
					"error":   "Persistence failed",
				})
				return
			}

			// 3. Send successful ACK only if Kafka confirmed
			sendSocketMessage(client, "message_ack", map[string]any{
				"temp_id":     tempID,
				"sequence_id": seqID,
				"room_id":     roomID,
				"success":     true,
			})

			debug.Print("GO-CHAT", "Message seq:"+strconv.FormatInt(seqID, 10)+" persisted and queued for room: "+roomID)
		} else if msg.Type == "read_receipt" {
			body, ok := payloadMap(msg.Payload)
			if !ok {
				return
			}

			// 1. Publish to Kafka for persistence and global sync
			err := producer.Publish(context.Background(), messaging.Event{
				Topic: "chat.inbound",
				Key:   msg.Target, // RoomID
				Type:  "READ_RECEIPT",
				Payload: map[string]any{
					"client_id":   client.UserID,
					"sequence_id": body["sequence_id"],
				},
			})
			if err != nil {
				debug.Print("GO-CHAT", "Read receipt publish failed: "+err.Error())
				return
			}
			debug.Print("GO-CHAT", "Read receipt received for room: "+msg.Target)
		}
	}

	// 4. Initialize Advanced Socket Hub
	hub := socket.NewHub("GO-CHAT", nodeID, rdb, handler)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go hub.Run(ctx)

	// 5. Initialize Delivery Consumer (Phase 2.2 Completion)
	deliveryConsumer := messaging.NewConsumer(strings.Split(kafkaBrokers, ","), "go-chat-group-"+nodeID, "chat.delivery")
	defer deliveryConsumer.Close()

	go func() {
		debug.Print("GO-CHAT", "Delivery consumer started for node: "+nodeID)
		err := deliveryConsumer.Consume(ctx, func(event messaging.Event) error {
			debug.Print("GO-CHAT", fmt.Sprintf("📦 Delivery Event Received: Type=%s, TargetUser=%s", event.Type, event.Key))

			data, err := json.Marshal(outboundMessage{
				Type:    normalizeDeliveryEventType(event.Type),
				Payload: event.Payload,
			})
			if err != nil {
				debug.Print("GO-CHAT", "Delivery marshal error: "+err.Error())
				return nil
			}

			success := hub.SendToUser(event.Key, data)
			if success {
				debug.Print("GO-CHAT", "✅ Successfully delivered to user: "+event.Key)
			} else {
				debug.Print("GO-CHAT", "⚠️ User not connected to this node: "+event.Key)
			}
			return nil
		})
		if err != nil {
			debug.Print("GO-CHAT", "❌ Delivery consumer error: "+err.Error())
		}
	}()

	// 6. Initialize Auth Verifier
	authBaseURL := os.Getenv("GO_AUTH_URL")
	if authBaseURL == "" {
		authBaseURL = "http://go-auth:8080"
	}
	internalSecret := os.Getenv("INTERNAL_SERVICE_SECRET")
	authVerifier := auth.NewVerifierClient(authBaseURL, internalSecret)

	// 7. Register HTTP Routes
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "Unauthorized: Token required", http.StatusUnauthorized)
			return
		}

		userID, err := authVerifier.VerifyToken(r.Context(), token)
		if err != nil {
			debug.Print("GO-CHAT", "Auth Failure: "+err.Error())
			http.Error(w, "Unauthorized: "+err.Error(), http.StatusUnauthorized)
			return
		}

		debug.Print("GO-CHAT", "SUCCESS: Authenticated User: "+userID)
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
