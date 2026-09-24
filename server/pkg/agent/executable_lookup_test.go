package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLookPathWithFallbackUsesPATH(t *testing.T) {
	tmp := t.TempDir()
	fake := filepath.Join(tmp, "codex")
	if err := os.WriteFile(fake, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", tmp)

	origGOOS := currentGOOS
	currentGOOS = "linux"
	t.Cleanup(func() { currentGOOS = origGOOS })

	got, err := lookPathWithFallback("codex")
	if err != nil {
		t.Fatalf("lookPathWithFallback returned error: %v", err)
	}
	if got != fake {
		t.Fatalf("want %q, got %q", fake, got)
	}
}

func TestLookPathWithFallbackUsesDarwinExtraDirs(t *testing.T) {
	tmp := t.TempDir()
	fake := filepath.Join(tmp, "codex")
	if err := os.WriteFile(fake, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", "")

	origGOOS := currentGOOS
	origDirs := darwinExtraBinDirs
	currentGOOS = "darwin"
	darwinExtraBinDirs = []string{tmp}
	t.Cleanup(func() {
		currentGOOS = origGOOS
		darwinExtraBinDirs = origDirs
	})

	got, err := lookPathWithFallback("codex")
	if err != nil {
		t.Fatalf("lookPathWithFallback returned error: %v", err)
	}
	if got != fake {
		t.Fatalf("want %q, got %q", fake, got)
	}
}
