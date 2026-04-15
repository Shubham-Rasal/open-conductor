package runner

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"

	agentpkg "github.com/Shubham-Rasal/open-conductor/server/pkg/agent"
)

// RemoteSSHExecutor runs a coding agent CLI on a remote host via ssh(1).
// sshURL must be like ssh://user@host:port (port optional, default 22).
type RemoteSSHExecutor struct {
	SSHURL   string
	WorkDir  string
	Provider string
	Logger   *slog.Logger
}

func (e *RemoteSSHExecutor) Execute(ctx context.Context, prompt string, opts agentpkg.ExecOptions) (*agentpkg.Session, error) {
	if e.Logger == nil {
		e.Logger = slog.Default()
	}
	user, host, port, err := parseSSHURL(e.SSHURL)
	if err != nil {
		return nil, err
	}
	if e.Provider != "claude" {
		return nil, fmt.Errorf("remote SSH executor supports %q only; got %q", "claude", e.Provider)
	}

	cwd := opts.Cwd
	if e.WorkDir != "" {
		cwd = e.WorkDir
	}
	if cwd == "" {
		return nil, fmt.Errorf("remote SSH: working directory is required on the workspace")
	}

	b64 := base64.StdEncoding.EncodeToString([]byte(prompt))
	remote := fmt.Sprintf(
		`set -euo pipefail; cd %q; echo %q | base64 -d | claude -p --output-format stream-json`,
		cwd, b64,
	)

	sshArgs := []string{
		"-o", "BatchMode=yes",
		"-o", "StrictHostKeyChecking=accept-new",
		"-p", port,
		fmt.Sprintf("%s@%s", user, host),
		remote,
	}

	to := opts.Timeout
	if to == 0 {
		to = 20 * time.Minute
	}
	runCtx, cancel := context.WithTimeout(ctx, to)
	defer cancel()

	cmd := exec.CommandContext(runCtx, "ssh", sshArgs...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("ssh stdout: %w", err)
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("ssh start: %w", err)
	}

	msgCh := make(chan agentpkg.Message, 256)
	resCh := make(chan agentpkg.Result, 1)

	go func() {
		defer close(msgCh)
		var out strings.Builder
		sc := bufio.NewScanner(stdout)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			line := sc.Text()
			out.WriteString(line)
			out.WriteByte('\n')
			select {
			case msgCh <- agentpkg.Message{Type: agentpkg.MessageText, Content: line + "\n"}:
			default:
			}
		}
		err := cmd.Wait()
		st := "completed"
		errStr := ""
		if err != nil {
			st = "failed"
			errStr = err.Error()
		}
		resCh <- agentpkg.Result{
			Status: st,
			Output: out.String(),
			Error:  errStr,
		}
		close(resCh)
	}()

	return &agentpkg.Session{Messages: msgCh, Result: resCh}, nil
}

func parseSSHURL(raw string) (user, host, port string, err error) {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if err != nil {
		return "", "", "", err
	}
	if u.Scheme != "ssh" {
		return "", "", "", fmt.Errorf("connection_url must use ssh:// (got scheme %q)", u.Scheme)
	}
	if u.User == nil || u.User.Username() == "" {
		return "", "", "", fmt.Errorf("ssh:// URL must include a user (ssh://user@host)")
	}
	user = u.User.Username()
	host = u.Hostname()
	if host == "" {
		return "", "", "", fmt.Errorf("ssh:// URL must include a host")
	}
	port = u.Port()
	if port == "" {
		port = "22"
	}
	return user, host, port, nil
}
