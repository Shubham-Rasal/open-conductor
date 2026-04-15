package runner

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	agentpkg "github.com/Shubham-Rasal/open-conductor/server/pkg/agent"
)

// Executor runs a prompt against a local CLI or a remote workspace endpoint.
type Executor interface {
	Execute(ctx context.Context, prompt string, opts agentpkg.ExecOptions) (*agentpkg.Session, error)
}

// LocalExecutor spawns the configured provider CLI on this machine (opencode, claude, codex, …).
type LocalExecutor struct {
	Provider string
	Logger   *slog.Logger
}

func (e *LocalExecutor) Execute(ctx context.Context, prompt string, opts agentpkg.ExecOptions) (*agentpkg.Session, error) {
	cfg := agentpkg.Config{Logger: e.Logger}
	if e.Logger == nil {
		cfg.Logger = slog.Default()
	}
	b, err := agentpkg.New(e.Provider, cfg)
	if err != nil {
		return nil, err
	}
	return b.Execute(ctx, prompt, opts)
}

// RemoteExecutor forwards execution to a non-SSH remote (not implemented).
type RemoteExecutor struct {
	BaseURL string
}

func (e *RemoteExecutor) Execute(ctx context.Context, prompt string, opts agentpkg.ExecOptions) (*agentpkg.Session, error) {
	_ = ctx
	_ = prompt
	_ = opts
	return nil, fmt.Errorf("remote executor not implemented for non-SSH URL (connection_url=%q); use ssh://user@host:port", e.BaseURL)
}

func newExecutor(provider, workspaceType string, connectionURL *string, workDir string, log *slog.Logger) Executor {
	if log == nil {
		log = slog.Default()
	}
	if workspaceType == "remote" && connectionURL != nil {
		u := strings.TrimSpace(*connectionURL)
		if strings.HasPrefix(u, "ssh://") {
			return &RemoteSSHExecutor{
				SSHURL:   u,
				WorkDir:  workDir,
				Provider: provider,
				Logger:   log,
			}
		}
		if u != "" {
			return &RemoteExecutor{BaseURL: u}
		}
	}
	return &LocalExecutor{Provider: provider, Logger: log}
}
