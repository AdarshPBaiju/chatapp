package main

import (
	"context"
	"crypto/rand"
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
			idempotencyKey, _ := body["idempotency_key"].(string)
			targetUserID, _ := body["target_user_id"].(string)
			roomID := msg.Target
			
			if idempotencyKey == "" {
				idempotencyKey = tempID
			}

			// Validation: Must have either roomID or targetUserID
			if (roomID == "" && targetUserID == "") || tempID == "" || strings.TrimSpace(content) == "" {
				sendSocketMessage(client, "message_ack", map[string]any{
					"temp_id": tempID,
					"success": false,
					"error":   "Room (or target_user_id), content, and temp_id are required",
				})
				return
			}

			var seqID int64
			if roomID != "" {
				var err error
				seqID, err = rdb.Incr(context.Background(), "room:seq:"+roomID).Result()
				if err != nil {
					debug.Print("GO-CHAT", "Redis Error (Sequencing): "+err.Error())
					sendSocketMessage(client, "message_ack", map[string]any{
						"temp_id": tempID,
						"success": false,
						"error":   "Unable to reserve message sequence",
					})
					return
				}
			}

			// Generate a properly formatted pseudo-UUID first
			b := make([]byte, 16)
			_, _ = rand.Read(b)
			msgID := fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])

			err := producer.Publish(context.Background(), messaging.Event{
				Topic: "chat.inbound",
				Key:   roomID,
				Type:  "CHAT_MESSAGE",
				Payload: map[string]any{
					"id":              msgID,
					"room_id":         roomID,
					"target_user_id":  targetUserID,
					"user_id":          client.UserID,
					"content":         content,
					"sender_id":       client.UserID,
					"temp_id":         tempID,
					"idempotency_key": idempotencyKey,
					"sequence_id":     seqID,
					"sent_at":         time.Now().UnixMilli(),
					"correlation_id":  fmt.Sprintf("corr-%s", msgID), // 🔍 Traceability
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

			// 🚀 HYPERSCALE OPTIMIZATION: Targeted Cross-Node Routing
			if targetUserID != "" {
				go func() {
					// 1. Find which node the target user is on
					targetNode, _ := rdb.Get(context.Background(), "user:node:"+targetUserID).Result()
					
					distEvent := map[string]any{
						"type": "chat_delivery",
						"target_user_id": targetUserID, // Explicit target for the receiving node
						"payload": map[string]any{
							"id":         msgID,
							"room_id":    roomID,
							"sender_id":  client.UserID,
							"content":    content,
							"created_at": time.Now().Format(time.RFC3339),
							"status":     "sent",
						},
					}
					distData, _ := json.Marshal(distEvent)
					
					if targetNode != "" {
						// Targeted publish to the specific node
						rdb.Publish(context.Background(), "node:delivery:"+targetNode, distData)
					} else {
						// Fallback: User might be on another node but not registered, or offline
						// In a true hyperscale system, we'd use a more robust fallback
						rdb.Publish(context.Background(), "user:delivery:broadcast", distData)
					}
				}()
			}

			sendSocketMessage(client, "message_ack", map[string]any{
				"temp_id":     tempID,
				"message_id":  msgID,
				"sequence_id": seqID,
				"room_id":     roomID,
				"status":      "acknowledged",
				"success":     true,
			})

			debug.Print("GO-CHAT", "Message seq:"+strconv.FormatInt(seqID, 10)+" persisted and short-circuited for room: "+roomID)
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
					"room_id":     msg.Target,
					"user_id":     client.UserID,
					"sequence_id": body["sequence_id"],
				},
			})
			if err != nil {
				debug.Print("GO-CHAT", "Read receipt publish failed: "+err.Error())
				return
			}
			debug.Print("GO-CHAT", "Read receipt received for room: "+msg.Target)
		} else if msg.Type == "ping" {
			sendSocketMessage(client, "pong", map[string]any{"ts": time.Now().UnixMilli()})
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

				if strings.ToUpper(event.Type) == "CHAT_DELIVERY" {
					payload, ok := payloadMap(event.Payload)
					if ok {
						senderID, _ := payload["sender_id"].(string)
						if senderID != "" && senderID != event.Key {
							statusPayload := map[string]any{
								"room_id":    payload["room_id"],
								"message_id": payload["id"],
								"temp_id":    payload["temp_id"],
								"status":     "delivered",
							}
							producer.Publish(ctx, messaging.Event{
								Topic:   "chat.delivery",
								Key:     senderID,
								Type:    "CHAT_STATUS",
								Payload: statusPayload,
							})
						}
					}
				}
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

	// 🚀 HORIZONTAL SCALE: Targeted Distributed Delivery Listener
	// Listen to our specific node's channel + global broadcast fallback
	go func() {
		nodeChannel := "node:delivery:" + nodeID
		pubsub := rdb.Subscribe(context.Background(), nodeChannel, "user:delivery:broadcast")
		defer pubsub.Close()

		ch := pubsub.Channel()
		debug.Print("GO-CHAT", "📡 Targeted delivery listener active on "+nodeChannel)
		for msg := range ch {
			var event struct {
				TargetUserID string `json:"target_user_id"`
				Payload      any    `json:"payload"`
			}
			if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
				continue
			}

			// Deliver directly to locally connected user
			data, _ := json.Marshal(map[string]any{
				"type":    "chat_delivery",
				"payload": event.Payload,
			})
			hub.SendToUser(event.TargetUserID, data)
		}
	}()

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
		
		// 🚀 PRESENCE REGISTRY: Mark user as connected to this specific node
		presenceKey := "user:node:" + userID
		rdb.Set(r.Context(), presenceKey, nodeID, 60*time.Second) // 60s TTL
		
		// Start a heartbeat goroutine to keep presence alive
		heartbeatCtx, stopHeartbeat := context.WithCancel(r.Context())
		go func() {
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					rdb.Set(heartbeatCtx, presenceKey, nodeID, 60*time.Second)
				case <-heartbeatCtx.Done():
					rdb.Del(context.Background(), presenceKey)
					return
				}
			}
		}()

		hub.ServeWs(w, r, userID)
		stopHeartbeat()
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
