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

var (
	chatHub     *socket.Hub
	presenceHub *socket.Hub
	rdb         *redis.Client
	producer    *messaging.Producer
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
	if strings.HasPrefix(redisURL, "redis://") {
		opts, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Fatalf("failed to parse redis url: %v", err)
		}
		rdb = redis.NewClient(opts)
	} else {
		rdb = redis.NewClient(&redis.Options{Addr: redisURL})
	}
	producer = messaging.NewProducer(strings.Split(kafkaBrokers, ","))
	defer producer.Close()

	// 3. Define Messaging Logic
	chatHub = socket.NewHub("CHAT", nodeID, rdb, chatHandler)
	presenceHub = socket.NewHub("PRESENCE", nodeID, rdb, presenceHandler)
	
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go chatHub.Run(ctx)
	go presenceHub.Run(ctx)

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

			success := chatHub.SendToUser(event.Key, data)
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

						producer.Publish(ctx, messaging.Event{
							Topic: "chat.receipts",
							Type:  "DELIVERY_RECEIPT",
							Payload: map[string]any{
								"message_id": payload["id"],
								"user_id":    event.Key, // recipient
							},
						})
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

	// 7. Register HTTP Routes
	http.HandleFunc("/ws/chat", func(w http.ResponseWriter, r *http.Request) {
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

		userID = strings.ToLower(userID)
		client := chatHub.ServeWs(w, r, userID)
		if client == nil {
			return
		}

		// Heartbeat
		go sessionHeartbeat(r.Context(), client)
	})

	http.HandleFunc("/ws/presence", func(w http.ResponseWriter, r *http.Request) {
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

		userID = strings.ToLower(userID)
		client := presenceHub.ServeWs(w, r, userID)
		if client == nil {
			return
		}

		// Heartbeat
		go sessionHeartbeat(r.Context(), client)
	})

	// 8. Bulk Presence API (HTTP Fallback)
	http.HandleFunc("/presence", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			return
		}

		userIDs := r.URL.Query().Get("user_ids")
		if userIDs == "" {
			json.NewEncoder(w).Encode(map[string]string{})
			return
		}

		ids := strings.Split(userIDs, ",")
		statusMap := make(map[string]string)

		pipe := rdb.Pipeline()
		scardResults := make(map[string]*redis.IntCmd)
		lastSeenResults := make(map[string]*redis.StringCmd)

		for _, id := range ids {
			id = strings.ToLower(strings.TrimSpace(id))
			if id == "" {
				continue
			}
			scardResults[id] = pipe.SCard(r.Context(), "user:sessions:"+id)
			lastSeenResults[id] = pipe.Get(r.Context(), "user:last_seen:"+id)
		}

		_, _ = pipe.Exec(r.Context())

		for id, cmd := range scardResults {
			count, _ := cmd.Result()
			if count > 0 || chatHub.HasLocalUser(id) || presenceHub.HasLocalUser(id) {
				statusMap[id] = "online"
			} else {
				lastSeen, _ := lastSeenResults[id].Result()
				if lastSeen != "" {
					statusMap[id] = "last_seen:" + lastSeen
				} else {
					statusMap[id] = "offline"
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(statusMap)
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// 9. Start Server
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

func chatHandler(client *socket.Client, payload []byte) {
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
		roomID, _ := body["room_id"].(string)
		targetUserID, _ := body["target_user_id"].(string)
		routeTarget := strings.ToLower(strings.TrimSpace(msg.Target))
		roomID = strings.TrimSpace(roomID)
		targetUserID = strings.ToLower(targetUserID)

		if roomID == "" && targetUserID == "" {
			roomID = routeTarget
		}

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
				"user_id":         client.UserID,
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

		sendSocketMessage(client, "message_ack", map[string]any{
			"temp_id":     tempID,
			"message_id":  msgID,
			"sequence_id": seqID,
			"room_id":     roomID,
			"status":      "sent",
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

func presenceHandler(client *socket.Client, payload []byte) {
	var msg socket.Message
	if err := json.Unmarshal(payload, &msg); err != nil {
		return
	}

	switch msg.Type {
	case "subscribe_presence":
		body, ok := payloadMap(msg.Payload)
		if !ok {
			return
		}
		userIDs, _ := body["user_ids"].([]any)
		for _, id := range userIDs {
			idStr, ok := id.(string)
			if ok {
				client.Hub.Subscribe(client, "presence:user:"+strings.ToLower(idStr))
			}
		}
	case "unsubscribe_presence":
		body, ok := payloadMap(msg.Payload)
		if !ok {
			return
		}
		userIDs, _ := body["user_ids"].([]any)
		for _, id := range userIDs {
			idStr, ok := id.(string)
			if ok {
				client.Hub.Unsubscribe(client, "presence:user:"+strings.ToLower(idStr))
			}
		}
	case "get_presence":
		body, _ := payloadMap(msg.Payload)
		userIDsStr, _ := body["user_ids"].([]any)
		statusMap := make(map[string]string)

		// 🚀 HYPER-OPTIMIZED: Pipelined Redis Queries
		pipe := rdb.Pipeline()
		scardResults := make(map[string]*redis.IntCmd)
		lastSeenResults := make(map[string]*redis.StringCmd)

		for _, id := range userIDsStr {
			idStr, ok := id.(string)
			if !ok {
				continue
			}
			idStr = strings.ToLower(idStr) // 🚀 NORMALIZE
			scardResults[idStr] = pipe.SCard(context.Background(), "user:sessions:"+idStr)
			lastSeenResults[idStr] = pipe.Get(context.Background(), "user:last_seen:"+idStr)
		}

		_, _ = pipe.Exec(context.Background())

		for idStr, cmd := range scardResults {
			count, _ := cmd.Result()

			// 🚀 DEEP FIX: Local Fallback
			isLocallyOnline := chatHub.HasLocalUser(idStr) || presenceHub.HasLocalUser(idStr)

			if count > 0 || isLocallyOnline {
				statusMap[idStr] = "online"
			} else {
				lastSeen, _ := lastSeenResults[idStr].Result()
				if lastSeen != "" {
					statusMap[idStr] = "last_seen:" + lastSeen
				} else {
					statusMap[idStr] = "offline"
				}
			}
		}
		sendSocketMessage(client, "presence_update", statusMap)
	case "ping":
		sendSocketMessage(client, "pong", map[string]any{"ts": time.Now().UnixMilli()})
	}
}

func sessionHeartbeat(ctx context.Context, client *socket.Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	nodeID, _ := os.Hostname()
	for {
		select {
		case <-ticker.C:
			normID := strings.ToLower(client.UserID)
			presenceKey := fmt.Sprintf("user:session:%s:%s", normID, client.SessionID)
			rdb.Set(context.Background(), presenceKey, nodeID, 60*time.Second)
			rdb.Set(context.Background(), "user:node:"+normID, nodeID, 120*time.Second)

			rdb.SAdd(context.Background(), "user:sessions:"+normID, client.SessionID)
			rdb.Expire(context.Background(), "user:sessions:"+normID, 120*time.Second)
		case <-ctx.Done():
			return
		}
	}
}
