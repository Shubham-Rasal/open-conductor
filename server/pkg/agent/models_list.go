package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"time"
)

// ModelOption is one selectable model id for workspace chat / agent settings.
type ModelOption struct {
	ID    string `json:"id"`
	Label string `json:"label,omitempty"`
}

// ListModelsForProvider returns models exposed by each CLI or cloud API:
//   - opencode: runs `opencode models` (same as the OpenCode CLI)
//   - claude: GET https://api.anthropic.com/v1/models (ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in server env); merges with CLI aliases (sonnet/opus/haiku)
//   - codex: GET https://api.openai.com/v1/models (OPENAI_API_KEY or CODEX_OPENAI_API_KEY); merges with common Codex defaults
func ListModelsForProvider(ctx context.Context, provider string) ([]ModelOption, error) {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "opencode":
		opts, err := listOpencodeCLIModels(ctx)
		if err != nil {
			slog.Warn("opencode models", "err", err)
			return []ModelOption{}, nil
		}
		return opts, nil
	case "claude":
		return listAnthropicAPIModels(ctx)
	case "codex":
		return listOpenAIModelsForCodex(ctx)
	default:
		return nil, fmt.Errorf("unknown provider %q", provider)
	}
}

func listOpencodeCLIModels(ctx context.Context) ([]ModelOption, error) {
	execPath := openCodeExecutablePath()
	if execPath == "" {
		if p, err := exec.LookPath("opencode"); err == nil {
			execPath = p
		}
	}
	if execPath == "" {
		return nil, nil
	}
	tctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	cmd := exec.CommandContext(tctx, execPath, "models")
	cmd.Env = os.Environ()
	cmd.Stdin = strings.NewReader("")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("opencode models: %w: %s", err, truncateForErr(out))
	}
	return parseOpencodeModelsOutput(string(out)), nil
}

func parseOpencodeModelsOutput(s string) []ModelOption {
	lines := strings.Split(s, "\n")
	seen := make(map[string]struct{})
	var opts []ModelOption
	for _, line := range lines {
		id := strings.TrimSpace(line)
		if id == "" || strings.HasPrefix(id, "#") {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		opts = append(opts, ModelOption{ID: id, Label: shortOpencodeLabel(id)})
	}
	sort.Slice(opts, func(i, j int) bool { return opts[i].ID < opts[j].ID })
	return opts
}

func shortOpencodeLabel(id string) string {
	if i := strings.LastIndex(id, "/"); i >= 0 && i+1 < len(id) {
		return id[i+1:]
	}
	return id
}

type anthropicModelsResp struct {
	Data []struct {
		ID             string `json:"id"`
		DisplayName    string `json:"display_name"`
		DisplayNameAlt string `json:"displayName"`
	} `json:"data"`
	HasMore    bool   `json:"has_more"`
	HasMoreAlt bool   `json:"hasMore"`
	LastID     string `json:"last_id"`
	LastIDAlt  string `json:"lastId"`
}

// claudeCodeCLIAliases are the short model ids documented by `claude --help` (--model).
// Used when ANTHROPIC_API_KEY is unset or the Models API is unreachable.
func claudeCodeCLIAliases() []ModelOption {
	return []ModelOption{
		{ID: "sonnet", Label: "Sonnet (latest)"},
		{ID: "opus", Label: "Opus (latest)"},
		{ID: "haiku", Label: "Haiku (latest)"},
	}
}

func listAnthropicAPIModels(ctx context.Context) ([]ModelOption, error) {
	key := firstNonEmpty(os.Getenv("ANTHROPIC_API_KEY"), os.Getenv("ANTHROPIC_AUTH_TOKEN"))
	if key == "" {
		return claudeCodeCLIAliases(), nil
	}
	var all []ModelOption
	after := ""
	for i := 0; i < 20; i++ {
		u := "https://api.anthropic.com/v1/models?limit=100"
		if after != "" {
			u += "&after_id=" + url.QueryEscape(after)
		}
		tctx, cancel := context.WithTimeout(ctx, 20*time.Second)
		req, err := http.NewRequestWithContext(tctx, http.MethodGet, u, nil)
		if err != nil {
			cancel()
			slog.Warn("anthropic models request", "err", err)
			return claudeCodeCLIAliases(), nil
		}
		req.Header.Set("x-api-key", key)
		req.Header.Set("anthropic-version", "2023-06-01")
		resp, err := http.DefaultClient.Do(req)
		cancel()
		if err != nil {
			slog.Warn("anthropic models fetch", "err", err)
			return claudeCodeCLIAliases(), nil
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			slog.Warn("anthropic /v1/models", "status", resp.StatusCode, "body", truncateForErr(body))
			return claudeCodeCLIAliases(), nil
		}
		var parsed anthropicModelsResp
		if err := json.Unmarshal(body, &parsed); err != nil {
			slog.Warn("anthropic models JSON", "err", err)
			return claudeCodeCLIAliases(), nil
		}
		for _, m := range parsed.Data {
			if strings.TrimSpace(m.ID) == "" {
				continue
			}
			label := strings.TrimSpace(m.DisplayName)
			if label == "" {
				label = strings.TrimSpace(m.DisplayNameAlt)
			}
			if label == "" {
				label = m.ID
			}
			all = append(all, ModelOption{ID: m.ID, Label: label})
		}
		hasMore := parsed.HasMore || parsed.HasMoreAlt
		last := parsed.LastID
		if last == "" {
			last = parsed.LastIDAlt
		}
		if !hasMore || last == "" {
			break
		}
		after = last
	}
	sort.Slice(all, func(i, j int) bool { return all[i].ID < all[j].ID })
	apiList := dedupeOptions(all)
	if len(apiList) > 500 {
		apiList = apiList[:500]
	}
	// Always include Claude Code CLI aliases (short ids) plus any API ids.
	merged := mergeModelOptionsOrdered(claudeCodeCLIAliases(), apiList)
	return merged, nil
}

type openAIModelsResp struct {
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
}

func codexDefaultModelPicker() []ModelOption {
	// Typical `codex -m` values when OpenAI listing is unavailable.
	return []ModelOption{
		{ID: "gpt-5", Label: "gpt-5"},
		{ID: "gpt-5-mini", Label: "gpt-5-mini"},
		{ID: "gpt-4.1", Label: "gpt-4.1"},
		{ID: "o4-mini", Label: "o4-mini"},
		{ID: "o3", Label: "o3"},
	}
}

func listOpenAIModelsForCodex(ctx context.Context) ([]ModelOption, error) {
	key := firstNonEmpty(os.Getenv("OPENAI_API_KEY"), os.Getenv("CODEX_OPENAI_API_KEY"))
	if key == "" {
		return codexDefaultModelPicker(), nil
	}
	tctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	req, err := http.NewRequestWithContext(tctx, http.MethodGet, "https://api.openai.com/v1/models", nil)
	if err != nil {
		cancel()
		slog.Warn("openai models request", "err", err)
		return codexDefaultModelPicker(), nil
	}
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := http.DefaultClient.Do(req)
	cancel()
	if err != nil {
		slog.Warn("openai models fetch", "err", err)
		return codexDefaultModelPicker(), nil
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		slog.Warn("openai /v1/models", "status", resp.StatusCode, "body", truncateForErr(body))
		return codexDefaultModelPicker(), nil
	}
	var parsed openAIModelsResp
	if err := json.Unmarshal(body, &parsed); err != nil {
		slog.Warn("openai models JSON", "err", err)
		return codexDefaultModelPicker(), nil
	}
	var out []ModelOption
	for _, m := range parsed.Data {
		id := m.ID
		if !codexModelRelevant(id) {
			continue
		}
		out = append(out, ModelOption{ID: id, Label: id})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	out = dedupeOptions(out)
	if len(out) > 500 {
		out = out[:500]
	}
	// Defaults cover new OpenAI id patterns the filter may miss; API list comes first.
	return mergeModelOptionsOrdered(out, codexDefaultModelPicker()), nil
}

var reGPTStyle = regexp.MustCompile(`(?i)^(gpt-|chatgpt-|o[0-9]|text-|davinci|curie|babbage|ada)`)

func codexModelRelevant(id string) bool {
	low := strings.ToLower(id)
	if strings.Contains(low, "embedding") || strings.Contains(low, "whisper") ||
		strings.Contains(low, "tts") || strings.Contains(low, "dall-e") || strings.Contains(low, "audio") ||
		strings.Contains(low, "realtime") || strings.Contains(low, "moderation") {
		return false
	}
	return reGPTStyle.MatchString(id)
}

func dedupeOptions(opts []ModelOption) []ModelOption {
	seen := make(map[string]struct{})
	var out []ModelOption
	for _, o := range opts {
		if o.ID == "" {
			continue
		}
		if _, ok := seen[o.ID]; ok {
			continue
		}
		seen[o.ID] = struct{}{}
		out = append(out, o)
	}
	return out
}

// mergeModelOptionsOrdered concatenates slices; IDs in first take precedence (no duplicates).
func mergeModelOptionsOrdered(first, second []ModelOption) []ModelOption {
	seen := make(map[string]struct{})
	var out []ModelOption
	for _, o := range first {
		if o.ID == "" {
			continue
		}
		if _, ok := seen[o.ID]; ok {
			continue
		}
		seen[o.ID] = struct{}{}
		out = append(out, o)
	}
	for _, o := range second {
		if o.ID == "" {
			continue
		}
		if _, ok := seen[o.ID]; ok {
			continue
		}
		seen[o.ID] = struct{}{}
		out = append(out, o)
	}
	return out
}

func firstNonEmpty(a, b string) string {
	a = strings.TrimSpace(a)
	if a != "" {
		return a
	}
	return strings.TrimSpace(b)
}

func truncateForErr(b []byte) string {
	s := string(b)
	if len(s) > 200 {
		return s[:200] + "…"
	}
	return s
}
