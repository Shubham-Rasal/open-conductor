package agent

import (
	"context"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// samplePingPrompt is intentionally tiny to minimize tokens for connectivity checks.
const samplePingPrompt = "Connectivity check: respond with only the single word PONG and nothing else."

// integrationAgent returns true when live CLI ping tests should run (requires CLIs + auth).
func integrationAgent() bool {
	return os.Getenv("INTEGRATION_AGENT") == "1"
}

func drainAgentMessages(msgs <-chan Message) {
	for range msgs {
	}
}

func TestIntegrationClaudeCodePing(t *testing.T) {
	if !integrationAgent() {
		t.Skip("set INTEGRATION_AGENT=1 to run live Claude Code ping (needs claude on PATH and auth)")
	}
	path, err := exec.LookPath("claude")
	if err != nil {
		t.Skipf("claude not on PATH: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	b, err := New("claude", Config{
		ExecutablePath: path,
		Logger:           slog.Default(),
	})
	if err != nil {
		t.Fatalf("New(claude): %v", err)
	}

	tmp := t.TempDir()
	session, err := b.Execute(ctx, samplePingPrompt, ExecOptions{
		Cwd:      tmp,
		Timeout:  4 * time.Minute,
		MaxTurns: 4,
	})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}

	go drainAgentMessages(session.Messages)
	result := <-session.Result

	if result.Status != "completed" {
		t.Fatalf("expected completed, got %q: %s", result.Status, result.Error)
	}
	if !strings.Contains(strings.ToUpper(result.Output), "PONG") {
		t.Fatalf("expected PONG in output, got: %q", result.Output)
	}
	t.Logf("claude ping ok, output length=%d", len(result.Output))
}

func TestIntegrationCodexPing(t *testing.T) {
	if !integrationAgent() {
		t.Skip("set INTEGRATION_AGENT=1 to run live Codex ping (needs codex on PATH and auth)")
	}
	path, err := exec.LookPath("codex")
	if err != nil {
		t.Skipf("codex not on PATH: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	b, err := New("codex", Config{
		ExecutablePath: path,
		Logger:           slog.Default(),
	})
	if err != nil {
		t.Fatalf("New(codex): %v", err)
	}

	tmp := t.TempDir()
	session, err := b.Execute(ctx, samplePingPrompt, ExecOptions{
		Cwd:     tmp,
		Timeout: 4 * time.Minute,
	})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}

	go drainAgentMessages(session.Messages)
	result := <-session.Result

	if result.Status != "completed" {
		t.Fatalf("expected completed, got %q: %s", result.Status, result.Error)
	}
	if !strings.Contains(strings.ToUpper(result.Output), "PONG") {
		t.Fatalf("expected PONG in output, got: %q", result.Output)
	}
	t.Logf("codex ping ok, output length=%d", len(result.Output))
}
