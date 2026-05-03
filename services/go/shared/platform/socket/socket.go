package socket

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"chatapp/services/go/shared/platform/debug"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

type MessageHandler func(client *Client, payload []byte)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 65536 // 64KB for media/files
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true // Configurable
	},
}

// Message is the generic container for real-time traffic
type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
	Target  string      `json:"target,omitempty"` // For P2P routing
}

// Hub manages distributed connections and topic subscriptions
type Hub struct {
	// Local state
	clients    map[*Client]bool
	userToConn map[string]map[*Client]bool // user_id -> Set of Clients
	topics     map[string]map[*Client]bool // topic -> Set of Clients
	mu         sync.RWMutex

	// Channels
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client

	// External Dependencies
	Redis      *redis.Client
	ServiceTag string
	NodeID     string // Unique ID for this cluster node
	Handler    MessageHandler
}

func NewHub(serviceTag, nodeID string, rdb *redis.Client, handler MessageHandler) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		userToConn: make(map[string]map[*Client]bool),
		topics:     make(map[string]map[*Client]bool),
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Redis:      rdb,
		ServiceTag: serviceTag,
		NodeID:     nodeID,
		Handler:    handler,
	}
}

func (h *Hub) Run(ctx context.Context) {
	debug.Print(h.ServiceTag, "Elite Distributed Hub started on Node: "+h.NodeID)

	// Subscribe to Redis for cross-node messaging
	if h.Redis != nil {
		go h.subscribeToCluster(ctx)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case client := <-h.Register:
			h.mu.Lock()
			h.clients[client] = true
			if client.UserID != "" {
				client.UserID = strings.ToLower(client.UserID)
				if h.userToConn[client.UserID] == nil {
					h.userToConn[client.UserID] = make(map[*Client]bool)
				}
				h.userToConn[client.UserID][client] = true

				if h.Redis != nil {
					debug.Print(h.ServiceTag, fmt.Sprintf("Registering Presence: User=%s, Session=%s", client.UserID, client.SessionID))
					h.Redis.SAdd(context.Background(), "user:sessions:"+client.UserID, client.SessionID)
					h.Redis.Expire(context.Background(), "user:sessions:"+client.UserID, 120*time.Second)
					h.Redis.Set(context.Background(), "user:node:"+client.UserID, h.NodeID, 120*time.Second)

					presenceKey := fmt.Sprintf("user:session:%s:%s", client.UserID, client.SessionID)
					h.Redis.Set(context.Background(), presenceKey, h.NodeID, 60*time.Second)

					count, _ := h.Redis.SCard(context.Background(), "user:sessions:"+client.UserID).Result()
					if count <= 1 {
						debug.Print(h.ServiceTag, "Broadcasting ONLINE for "+client.UserID)
						update := map[string]any{
							"type": "user_presence",
							"payload": map[string]any{
								"user_id": client.UserID,
								"status":  "online",
							},
						}
						data, _ := json.Marshal(update)
						h.Redis.Publish(context.Background(), "presence:user:"+client.UserID, data)
						h.Redis.Publish(context.Background(), "cluster:broadcast", data)
					}
				}
			}
			h.mu.Unlock()
			debug.Print(h.ServiceTag, "Connection established: "+client.UserID)

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				
				// Cleanup user connections
				if client.UserID != "" {
					if set, ok := h.userToConn[client.UserID]; ok {
						delete(set, client)
						if len(set) == 0 {
							delete(h.userToConn, client.UserID)
						}
					}

					// 🚀 HYPER-OPTIMIZED: Final Session Cleanup
					if h.Redis != nil {
						debug.Print(h.ServiceTag, fmt.Sprintf("Unregistering Presence: User=%s, Session=%s", client.UserID, client.SessionID))
						h.Redis.SRem(context.Background(), "user:sessions:"+client.UserID, client.SessionID)
						h.Redis.Del(context.Background(), "user:session:"+client.UserID+":"+client.SessionID)

						remaining, _ := h.Redis.SCard(context.Background(), "user:sessions:"+client.UserID).Result()
						debug.Print(h.ServiceTag, fmt.Sprintf("Remaining Sessions for %s: %d", client.UserID, remaining))
						if remaining == 0 {
							h.Redis.Del(context.Background(), "user:node:"+client.UserID)
							debug.Print(h.ServiceTag, "Broadcasting OFFLINE for "+client.UserID)
							now := time.Now().UnixMilli()
							h.Redis.Set(context.Background(), "user:last_seen:"+client.UserID, now, 0)

							update := map[string]any{
								"type": "user_presence",
								"payload": map[string]any{
									"user_id": client.UserID,
									"status":  "last_seen:" + fmt.Sprintf("%d", now),
								},
							}
							data, _ := json.Marshal(update)
							h.Redis.Publish(context.Background(), "presence:user:"+client.UserID, data)
							h.Redis.Publish(context.Background(), "cluster:broadcast", data)
						}
					}
				}

				// Cleanup topic subscriptions
				for topic := range client.topics {
					if set, ok := h.topics[topic]; ok {
						delete(set, client)
						if len(set) == 0 {
							delete(h.topics, topic)
						}
					}
				}
				
				close(client.Send)
			}
			h.mu.Unlock()
			debug.Print(h.ServiceTag, "Connection closed: "+client.UserID)

		case msg := <-h.Broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- msg:
				default:
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Subscribe(client *Client, topic string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	if h.topics[topic] == nil {
		h.topics[topic] = make(map[*Client]bool)
		if h.Redis != nil {
			go h.subscribeToTopic(context.Background(), topic)
		}
	}
	h.topics[topic][client] = true
	client.topics[topic] = true
	debug.Print(h.ServiceTag, fmt.Sprintf("Client %s subscribed to %s", client.UserID, topic))
}

func (h *Hub) Unsubscribe(client *Client, topic string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	
	if set, ok := h.topics[topic]; ok {
		delete(set, client)
		if len(set) == 0 {
			delete(h.topics, topic)
		}
	}
	delete(client.topics, topic)
}

func (h *Hub) BroadcastToTopic(topic string, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	
	clients, ok := h.topics[topic]
	if !ok {
		return
	}
	
	for client := range clients {
		select {
		case client.Send <- payload:
		default:
		}
	}
}

func (h *Hub) SendToUser(userID string, payload []byte) bool {
	userID = strings.ToLower(userID)
	h.mu.RLock()
	clients, ok := h.userToConn[userID]
	if !ok || len(clients) == 0 {
		h.mu.RUnlock()
		return false
	}

	for client := range clients {
		select {
		case client.Send <- payload:
		default:
		}
	}
	h.mu.RUnlock()
	return true
}

func (h *Hub) HasLocalUser(userID string) bool {
	userID = strings.ToLower(userID)
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients, ok := h.userToConn[userID]
	return ok && len(clients) > 0
}

func (h *Hub) subscribeToCluster(ctx context.Context) {
	topic := "cluster:msg:" + h.NodeID
	pubsub := h.Redis.Subscribe(ctx, topic, "cluster:broadcast")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch {
		h.Broadcast <- []byte(msg.Payload)
	}
}

func (h *Hub) subscribeToTopic(ctx context.Context, topic string) {
	pubsub := h.Redis.Subscribe(ctx, topic)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch {
		h.BroadcastToTopic(topic, []byte(msg.Payload))
		
		// Optimization: If no more local subscribers, stop the goroutine
		h.mu.RLock()
		subscriberCount := len(h.topics[topic])
		h.mu.RUnlock()
		if subscriberCount == 0 {
			return
		}
	}
}

// Client represents a single persistent connection
type Client struct {
	Hub       *Hub
	Conn      *websocket.Conn
	Send      chan []byte
	UserID    string
	SessionID string
	topics    map[string]bool
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		if c.Hub.Handler != nil {
			c.Hub.Handler(c, message)
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) ServeWs(w http.ResponseWriter, r *http.Request, userID string) *Client {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return nil
	}
	sessionID := fmt.Sprintf("%d", time.Now().UnixNano())
	client := &Client{
		Hub:       h,
		Conn:      conn,
		Send:      make(chan []byte, 1024),
		UserID:    userID,
		SessionID: sessionID,
		topics:    make(map[string]bool),
	}
	h.Register <- client

	go client.WritePump()
	go client.ReadPump()
	return client
}
