package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
)

func parseUUID(s string) string {
	return strings.TrimSpace(s)
}

func formatUUID(id string) string {
	return strings.TrimSpace(id)
}

func ptrToNullString(p *string) sql.NullString {
	if p == nil {
		return sql.NullString{}
	}
	s := strings.TrimSpace(*p)
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func ptrToNullInt64(p *int32) sql.NullInt64 {
	if p == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(*p), Valid: true}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func broadcastEvent(eventType string, payload any) {
	data, err := json.Marshal(map[string]any{
		"type":    eventType,
		"payload": payload,
	})
	if err != nil {
		return
	}
	Broadcast(data)
}
