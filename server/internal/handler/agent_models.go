package handler

import (
	"log/slog"
	"net/http"
	"strings"

	agentpkg "github.com/Shubham-Rasal/open-conductor/server/pkg/agent"
)

// GET /api/agent-models?provider=claude|codex|opencode
// Returns models from each tool's interface (Anthropic API, OpenAI API, or `opencode models`).
func listAgentModels() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p := normalizeAgentModelsProvider(r.URL.Query().Get("provider"))
		if p != "claude" && p != "codex" && p != "opencode" {
			http.Error(w, "query provider must be claude, codex, or opencode", http.StatusBadRequest)
			return
		}
		opts, err := agentpkg.ListModelsForProvider(r.Context(), p)
		if err != nil {
			slog.Warn("agent-models", "provider", p, "err", err)
			opts = []agentpkg.ModelOption{}
		}
		if opts == nil {
			opts = []agentpkg.ModelOption{}
		}
		writeJSON(w, opts)
	}
}

// normalizeAgentModelsProvider maps UI/legacy strings to claude|codex|opencode.
func normalizeAgentModelsProvider(raw string) string {
	p := strings.ToLower(strings.TrimSpace(raw))
	switch p {
	case "claude", "codex", "opencode":
		return p
	}
	c := strings.ReplaceAll(p, " ", "")
	c = strings.ReplaceAll(c, "-", "")
	c = strings.ReplaceAll(c, "_", "")
	switch c {
	case "claudecode", "anthropic":
		return "claude"
	case "openai", "chatgpt":
		return "codex"
	case "opencode":
		return "opencode"
	}
	switch {
	case strings.HasPrefix(p, "claude"):
		return "claude"
	case strings.HasPrefix(p, "codex"):
		return "codex"
	case strings.HasPrefix(p, "opencode"):
		return "opencode"
	}
	return p
}
