package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDetectAgentsReturnsJSON(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/detect-agents", nil)
	rr := httptest.NewRecorder()
	detectAgents(&Store{})(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: %d", rr.Code)
	}
	ct := rr.Header().Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		t.Fatalf("Content-Type: %q", ct)
	}
	var tools []map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &tools); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	// May be empty or list installed CLIs — just verify array shape
	_ = tools
}
