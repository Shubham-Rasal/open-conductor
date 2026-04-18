package handler

import (
	"log/slog"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

// Serialize WebSocket writes: gorilla/websocket allows at most one concurrent writer
// per connection. Concurrent Broadcast calls must not call WriteMessage in parallel
// on the same conn.
var broadcastWriteMu sync.Mutex

var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

// hub manages all active WebSocket connections.
var hub = &wsHub{
	clients: make(map[*websocket.Conn]struct{}),
}

type wsHub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]struct{}
}

func (h *wsHub) add(c *websocket.Conn) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *wsHub) remove(c *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
}

// Broadcast sends a message to all connected clients.
func Broadcast(msg []byte) {
	hub.mu.RLock()
	clients := make([]*websocket.Conn, 0, len(hub.clients))
	for c := range hub.clients {
		clients = append(clients, c)
	}
	hub.mu.RUnlock()

	broadcastWriteMu.Lock()
	defer broadcastWriteMu.Unlock()
	for _, c := range clients {
		_ = c.WriteMessage(websocket.TextMessage, msg)
	}
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws upgrade", "err", err)
		return
	}
	hub.add(conn)
	defer func() {
		hub.remove(conn)
		conn.Close()
	}()

	// Read loop — keep connection alive, discard client messages for now
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}
