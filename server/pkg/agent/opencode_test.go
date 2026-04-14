package agent

import (
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"testing"
)

func TestOpencodeProcessEventsText(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	input := `{"type":"text","part":{"text":"Hello from opencode"}}
`
	res := b.processEvents(strings.NewReader(input), ch)
	if res.output != "Hello from opencode" {
		t.Fatalf("output: got %q", res.output)
	}
	if res.status != "completed" {
		t.Fatalf("status: %s", res.status)
	}
	msg := <-ch
	if msg.Type != MessageText || msg.Content != "Hello from opencode" {
		t.Fatalf("unexpected message: %+v", msg)
	}
}

func TestOpencodeProcessEventsEmptyText(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	input := `{"type":"text","part":{"text":""}}
`
	res := b.processEvents(strings.NewReader(input), ch)
	if res.output != "" {
		t.Fatalf("expected empty output, got %q", res.output)
	}
	if len(ch) != 0 {
		t.Fatalf("expected no messages, got %d", len(ch))
	}
}

func TestOpencodeProcessEventsToolUseCompleted(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	line := `{"type":"tool_use","part":{"tool":"bash","callID":"call_1","state":{"status":"completed","input":{"command":"pwd"},"output":"/tmp/x\n"}}}` + "\n"
	b.processEvents(strings.NewReader(line), ch)
	if len(ch) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(ch))
	}
	m1 := <-ch
	m2 := <-ch
	if m1.Type != MessageToolUse || m1.Tool != "bash" {
		t.Fatalf("m1: %+v", m1)
	}
	if m2.Type != MessageToolResult || m2.Output != "/tmp/x\n" {
		t.Fatalf("m2: %+v", m2)
	}
}

func TestOpencodeProcessEventsToolUseRunning(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	line := `{"type":"tool_use","part":{"tool":"read","callID":"c2","state":{"status":"pending","input":{"path":"/a"}}}}` + "\n"
	b.processEvents(strings.NewReader(line), ch)
	if len(ch) != 1 {
		t.Fatalf("expected 1 message, got %d", len(ch))
	}
	m := <-ch
	if m.Type != MessageToolUse || m.Tool != "read" {
		t.Fatalf("unexpected: %+v", m)
	}
}

func TestOpencodeProcessEventsError(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	line := `{"type":"error","part":{},"error":{"name":"E","data":{"message":"bad model"}}}` + "\n"
	res := b.processEvents(strings.NewReader(line), ch)
	if res.status != "failed" || res.errMsg != "bad model" {
		t.Fatalf("result: %+v", res)
	}
	m := <-ch
	if m.Type != MessageError || m.Content != "bad model" {
		t.Fatalf("message: %+v", m)
	}
}

func TestOpencodeProcessEventsErrorNoData(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	line := `{"type":"error","part":{},"error":{"name":"RateLimit"}}` + "\n"
	res := b.processEvents(strings.NewReader(line), ch)
	if res.errMsg != "RateLimit" {
		t.Fatalf("got %q", res.errMsg)
	}
}

func TestOpencodeProcessEventsStepStart(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	line := `{"type":"step_start","part":{}}` + "\n"
	res := b.processEvents(strings.NewReader(line), ch)
	if res.status != "completed" {
		t.Fatalf("status %s", res.status)
	}
	m := <-ch
	if m.Type != MessageStatus || m.Status != "running" {
		t.Fatalf("unexpected: %+v", m)
	}
}

func TestOpencodeProcessEventsStepFinishTokens(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	line := `{"type":"step_finish","part":{"tokens":{"input":10,"output":20}}}` + "\n"
	res := b.processEvents(strings.NewReader(line), ch)
	if res.usage.InputTokens != 10 || res.usage.OutputTokens != 20 {
		t.Fatalf("usage: %+v", res.usage)
	}
	if len(ch) != 0 {
		t.Fatalf("step_finish should not emit to ch, got %d", len(ch))
	}
}

func TestOpencodeProcessEventsStepFinishCacheTokens(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	line := `{"type":"step_finish","part":{"tokens":{"input":1,"output":2,"cache":{"read":3,"write":4}}}}` + "\n"
	res := b.processEvents(strings.NewReader(line), ch)
	if res.usage.CacheReadTokens != 3 || res.usage.CacheWriteTokens != 4 {
		t.Fatalf("usage: %+v", res.usage)
	}
}

func TestOpencodeProcessEventsSessionID(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	line := `{"type":"text","sessionID":"ses_xyz","part":{"text":"x"}}` + "\n"
	res := b.processEvents(strings.NewReader(line), ch)
	if res.sessionID != "ses_xyz" {
		t.Fatalf("sessionID: %q", res.sessionID)
	}
	<-ch
}

func TestOpencodeHandleToolOutputString(t *testing.T) {
	t.Parallel()
	if got := extractToolOutput("plain"); got != "plain" {
		t.Fatalf("got %q", got)
	}
}

func TestOpencodeHandleToolOutputObject(t *testing.T) {
	t.Parallel()
	got := extractToolOutput(map[string]any{"k": "v"})
	if got == "" || !strings.Contains(got, "k") {
		t.Fatalf("got %q", got)
	}
}

func TestOpencodeErrorMessage(t *testing.T) {
	t.Parallel()
	e := &opencodeError{Name: "N", Data: &opencodeErrData{Message: "msg"}}
	if e.Message() != "msg" {
		t.Fatal()
	}
	e2 := &opencodeError{Name: "OnlyName"}
	if e2.Message() != "OnlyName" {
		t.Fatal()
	}
	e3 := &opencodeError{}
	if e3.Message() != "" {
		t.Fatal()
	}
}

func TestOpencodeHandleTextEvent(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{}
	ch := make(chan Message, 10)
	var sb strings.Builder
	event := opencodeEvent{
		Type:      "text",
		SessionID: "ses_abc",
		Part:      opencodeEventPart{Type: "text", Text: "Hello from opencode"},
	}
	b.handleTextEvent(event, ch, &sb)
	if sb.String() != "Hello from opencode" {
		t.Fatal(sb.String())
	}
	msg := <-ch
	if msg.Type != MessageText || msg.Content != "Hello from opencode" {
		t.Fatalf("%+v", msg)
	}
}

func TestOpencodeHandleToolUseEventCompleted(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{}
	ch := make(chan Message, 10)
	event := opencodeEvent{
		Type: "tool_use",
		Part: opencodeEventPart{
			Tool:   "bash",
			CallID: "call_BHA1",
			State: &opencodeToolState{
				Status: "completed",
				Input:  json.RawMessage(`{"command":"pwd","description":"x"}`),
				Output: "/tmp/multica\n",
			},
		},
	}
	b.handleToolUseEvent(event, ch)
	if len(ch) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(ch))
	}
	<-ch
	msg := <-ch
	if msg.Type != MessageToolResult || msg.Output != "/tmp/multica\n" {
		t.Fatalf("%+v", msg)
	}
}

func TestOpencodeHandleToolUseEventPending(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{}
	ch := make(chan Message, 10)
	event := opencodeEvent{
		Type: "tool_use",
		Part: opencodeEventPart{
			Tool:   "read",
			CallID: "call_ABC",
			State: &opencodeToolState{
				Status: "pending",
				Input:  json.RawMessage(`{"filePath":"/tmp/test.go"}`),
			},
		},
	}
	b.handleToolUseEvent(event, ch)
	if len(ch) != 1 {
		t.Fatalf("expected 1 message, got %d", len(ch))
	}
}

func TestOpencodeProcessEventsScannerError(t *testing.T) {
	t.Parallel()
	b := &opencodeBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 10)
	r := &errReader{err: io.ErrUnexpectedEOF}
	res := b.processEvents(r, ch)
	if res.status != "failed" || !strings.Contains(res.errMsg, "stdout read error") {
		t.Fatalf("got status=%q err=%q", res.status, res.errMsg)
	}
}

type errReader struct {
	err error
}

func (e *errReader) Read(p []byte) (int, error) {
	return 0, e.err
}
