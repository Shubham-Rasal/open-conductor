package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// openCodeExecutablePath returns an explicit binary from OPENCODE_PATH or MULTICA_OPENCODE_PATH
// (absolute path or PATH lookup). Empty string if unset — caller should fall back to LookPath("opencode").
func openCodeExecutablePath() string {
	for _, key := range []string{"OPENCODE_PATH", "MULTICA_OPENCODE_PATH"} {
		p := strings.TrimSpace(os.Getenv(key))
		if p == "" {
			continue
		}
		if filepath.IsAbs(p) {
			if _, err := os.Stat(p); err == nil {
				return p
			}
			continue
		}
		if lp, err := exec.LookPath(p); err == nil {
			return lp
		}
	}
	return ""
}

func opencodeUserConfigPath() string {
	if xdg := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME")); xdg != "" {
		return filepath.Join(xdg, "opencode", "opencode.json")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.Getenv("HOME"), ".config", "opencode", "opencode.json")
	}
	return filepath.Join(home, ".config", "opencode", "opencode.json")
}

// DetectedTool describes a locally-installed AI coding CLI.
type DetectedTool struct {
	Provider     string `json:"provider"` // "claude" | "opencode" | "codex"
	Path         string `json:"path"`
	Version      string `json:"version"`
	Label        string `json:"label"`
	DefaultModel string `json:"default_model"`    // suggested model string for ExecOptions
	Available    bool   `json:"available"`        // false if provider backend is unreachable
	Reason       string `json:"reason,omitempty"` // why unavailable
}

// DetectAll probes PATH for known AI CLI tools and returns those found,
// including availability status for each.
func DetectAll(ctx context.Context) []DetectedTool {
	var found []DetectedTool

	// ── Claude Code ──────────────────────────────────────────────────────────
	if path, err := exec.LookPath("claude"); err == nil {
		version, _ := DetectVersion(ctx, path)
		found = append(found, DetectedTool{
			Provider:  "claude",
			Path:      path,
			Version:   version,
			Label:     "Claude Code",
			Available: true, // uses ~/.claude/settings.json auth, no extra probe needed
		})
	}

	// ── OpenCode ─────────────────────────────────────────────────────────────
	opPath := openCodeExecutablePath()
	if opPath == "" {
		if p, err := exec.LookPath("opencode"); err == nil {
			opPath = p
		}
	}
	if opPath != "" {
		version, _ := DetectVersion(ctx, opPath)
		tool := DetectedTool{
			Provider: "opencode",
			Path:     opPath,
			Version:  version,
			Label:    "OpenCode",
		}
		model, baseURL, probeErr := probeOpencode()
		if probeErr != nil {
			tool.Available = false
			tool.Reason = probeErr.Error()
		} else if strings.TrimSpace(baseURL) == "" {
			// No local API base — cloud / default routing. Do not GET "/models" (baseURL empty used to build bogus "/models").
			tool.Available = true
			tool.DefaultModel = model
		} else {
			modelsURL := strings.TrimRight(strings.TrimSpace(baseURL), "/") + "/models"
			if reachable, reason := checkURL(ctx, modelsURL); reachable {
				tool.Available = true
				tool.DefaultModel = model
			} else {
				tool.Available = false
				tool.Reason = reason
			}
		}
		found = append(found, tool)
	}

	// ── Codex ────────────────────────────────────────────────────────────────
	if path, err := exec.LookPath("codex"); err == nil {
		version, _ := DetectVersion(ctx, path)
		found = append(found, DetectedTool{
			Provider:  "codex",
			Path:      path,
			Version:   version,
			Label:     "Codex",
			Available: true, // codex uses its own auth
		})
	}

	return found
}

// probeOpencode reads the opencode config and returns (model, baseURL, error).
func probeOpencode() (model string, baseURL string, err error) {
	data, err := os.ReadFile(opencodeUserConfigPath())
	if err != nil {
		return "", "", nil // no config = use default (likely needs API key)
	}

	var cfg struct {
		Provider map[string]struct {
			Models  map[string]any `json:"models"`
			Options struct {
				BaseURL string `json:"baseURL"`
			} `json:"options"`
		} `json:"provider"`
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return "", "", nil
	}

	// Find first configured provider with a model
	for providerName, p := range cfg.Provider {
		for modelName := range p.Models {
			return providerName + "/" + modelName, p.Options.BaseURL, nil
		}
		// Provider exists but no model listed — still return its baseURL
		if p.Options.BaseURL != "" {
			return providerName + "/default", p.Options.BaseURL, nil
		}
	}
	return "", "", nil
}

// checkURL does a quick GET to see if the endpoint is reachable.
func checkURL(ctx context.Context, url string) (bool, string) {
	if url == "" {
		return true, "" // no baseURL means cloud API — assume reachable
	}
	tctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(tctx, http.MethodGet, url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		// Simplify the error message
		msg := err.Error()
		if strings.Contains(msg, "connection refused") {
			return false, "local server not running (connection refused)"
		}
		return false, "unreachable: " + msg
	}
	resp.Body.Close()
	return true, ""
}
