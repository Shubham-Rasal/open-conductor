package agent

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestOpenCodeExecutablePathAbsolute(t *testing.T) {
	tmp := t.TempDir()
	fake := filepath.Join(tmp, "fake-opencode")
	if err := os.WriteFile(fake, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENCODE_PATH", fake)
	t.Setenv("MULTICA_OPENCODE_PATH", "")
	if got := openCodeExecutablePath(); got != fake {
		t.Fatalf("openCodeExecutablePath: want %q got %q", fake, got)
	}
}

func TestCheckURLEmptyIsReachable(t *testing.T) {
	t.Parallel()
	ok, reason := checkURL(context.Background(), "")
	if !ok || reason != "" {
		t.Fatalf("expected true, empty reason; got %v %q", ok, reason)
	}
}

func TestCheckURLUnreachable(t *testing.T) {
	t.Parallel()
	ok, reason := checkURL(context.Background(), "http://127.0.0.1:1/models")
	if ok {
		t.Fatal("expected unreachable")
	}
	if reason == "" {
		t.Fatal("expected non-empty reason")
	}
}

func TestProbeOpencodeNoConfigReturnsEmpty(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	model, baseURL, err := probeOpencode()
	if err != nil {
		t.Fatal(err)
	}
	if model != "" || baseURL != "" {
		t.Fatalf("expected empty model and baseURL, got %q %q", model, baseURL)
	}
}

func TestProbeOpencodeInvalidJSONReturnsEmpty(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	cfgDir := filepath.Join(tmp, ".config", "opencode")
	if err := os.MkdirAll(cfgDir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(cfgDir, "opencode.json")
	if err := os.WriteFile(path, []byte(`not json`), 0o644); err != nil {
		t.Fatal(err)
	}
	model, baseURL, err := probeOpencode()
	if err != nil {
		t.Fatal(err)
	}
	if model != "" || baseURL != "" {
		t.Fatalf("expected empty, got %q %q", model, baseURL)
	}
}

func TestProbeOpencodeExtracts(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	cfgDir := filepath.Join(tmp, ".config", "opencode")
	if err := os.MkdirAll(cfgDir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(cfgDir, "opencode.json")
	payload := `{
  "provider": {
    "openrouter": {
      "models": { "gpt-4": {} },
      "options": { "baseURL": "https://api.example.com" }
    }
  }
}`
	if err := os.WriteFile(path, []byte(payload), 0o644); err != nil {
		t.Fatal(err)
	}
	model, baseURL, err := probeOpencode()
	if err != nil {
		t.Fatal(err)
	}
	if model != "openrouter/gpt-4" {
		t.Fatalf("model: got %q", model)
	}
	if baseURL != "https://api.example.com" {
		t.Fatalf("baseURL: got %q", baseURL)
	}
}
