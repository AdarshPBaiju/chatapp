package socket

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"chatapp/services/go/shared/platform/debug"
)

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

// Hub manages distributed connections
type Hub struct {
	// Local state
	clients    map[*Client]bool
	userToConn map[string]*Client // user_id -> Client
	mu         sync.RWMutex

	// Channels
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client

	// External Dependencies
	Redis      *redis.Client
	ServiceTag string
	NodeID     string // Unique ID for this cluster node
}

func NewHub(serviceTag, nodeID string, rdb *redis.Client) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		userToConn: make(map[string]*Client),
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Redis:      rdb,
		ServiceTag: serviceTag,
		NodeID:     nodeID,
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
				h.userToConn[client.UserID] = client
			}
			h.mu.Unlock()
			debug.Print(h.ServiceTag, "Connection established: "+client.UserID)

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				if client.UserID != "" {
					delete(h.userToConn, client.UserID)
				}
				close(client.Send)
			}
			h.mu.Unlock()
			debug.Print(h.ServiceTag, "Connection closed: "+client.UserID)

		case msg := <-h.Broadcast:
			// Local fan-out
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- msg:
				default:
					// Slow consumer handling
				}
			}
			h.mu.RUnlock()
		}
	}
}

// subscribeToCluster listens for messages intended for users on this node
func (h *Hub) subscribeToCluster(ctx context.Context) {
	topic := "cluster:msg:" + h.NodeID
	pubsub := h.Redis.Subscribe(ctx, topic, "cluster:broadcast")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch {
		// Forward to local broadcast or specific user
		h.Broadcast <- []byte(msg.Payload)
	}
}

// Client represents a single persistent connection
type Client struct {
	Hub    *Hub
	Conn   *websocket.Conn
	Send   chan []byte
	UserID string
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
		// Logic to handle inbound messages (e.g., publish to Kafka)
		log.Printf("Received: %s", message)
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

func (h *Hub) ServeWs(w http.ResponseWriter, r *http.Request, userID string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &Client{Hub: h, Conn: conn, Send: make(chan []byte, 1024), UserID: userID}
	h.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
