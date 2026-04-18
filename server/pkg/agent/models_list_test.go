package agent

import (
	"testing"
)

func TestParseOpencodeModelsOutput(t *testing.T) {
	in := `
google/gemini-2.5-flash
ollama/qwen3.5:9b

google/gemini-2.5-flash
`
	opts := parseOpencodeModelsOutput(in)
	if len(opts) != 2 {
		t.Fatalf("want 2 unique models, got %d", len(opts))
	}
	if opts[0].ID != "google/gemini-2.5-flash" {
		t.Fatalf("sort order: got %q", opts[0].ID)
	}
	if opts[0].Label != "gemini-2.5-flash" {
		t.Fatalf("label: got %q", opts[0].Label)
	}
}

func TestCodexModelRelevant(t *testing.T) {
	cases := []struct {
		id   string
		want bool
	}{
		{"gpt-5", true},
		{"gpt-4.1", true},
		{"o4-mini", true},
		{"text-davinci-003", true},
		{"text-embedding-3-small", false},
		{"whisper-1", false},
		{"dall-e-3", false},
	}
	for _, tc := range cases {
		if got := codexModelRelevant(tc.id); got != tc.want {
			t.Errorf("codexModelRelevant(%q) = %v, want %v", tc.id, got, tc.want)
		}
	}
}
