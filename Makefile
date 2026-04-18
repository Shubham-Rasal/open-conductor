.PHONY: help dev dev-watch setup server server-watch desktop build desktop-bundle-go desktop-package test migrate-up migrate-down sqlc

help: ## Show common targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# Repo root (works when make is invoked from any cwd)
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

# Load .env from project root if present (exports all vars to subprocesses)
-include $(ROOT)/.env
export

# ─── Setup ────────────────────────────────────────────────────────────────────

setup: ## First-time project setup
	@cp -n $(ROOT)/.env.example $(ROOT)/.env 2>/dev/null || true
	@cd $(ROOT) && pnpm install
	@cd $(ROOT) && docker compose up -d
	@sleep 3
	@$(MAKE) migrate-up
	@echo "Setup complete. Run 'make dev' to start."

# ─── Development ──────────────────────────────────────────────────────────────
#
#  make dev        — API + Electron (Ctrl+C stops both)
#  make dev-watch  — same, but Go server restarts on .go changes (needs: air)
#

dev: ## Run Go API + Electron desktop together (Ctrl+C stops both)
	@$(MAKE) -j2 server desktop

dev-watch: ## Like dev, but Go server auto-restarts on file changes (requires air)
	@$(MAKE) -j2 server-watch desktop

desktop: ## Electron + Vite only (hot reload in renderer)
	@cd $(ROOT) && pnpm exec turbo dev --filter=@open-conductor/desktop

server: ## Go API only (no auto-restart)
	@cd $(ROOT)/server && go run ./cmd/server

server-watch: ## Go API with live reload (go install github.com/air-verse/air@latest)
	@command -v air >/dev/null 2>&1 || { \
		echo "air not found. Install: go install github.com/air-verse/air@latest"; \
		exit 1; \
	}
	@cd $(ROOT)/server && air

# ─── Build ────────────────────────────────────────────────────────────────────

build: ## Build Go binaries to server/bin/
	@mkdir -p $(ROOT)/server/bin
	@cd $(ROOT)/server && go build -o bin/server ./cmd/server
	@cd $(ROOT)/server && go build -o bin/migrate ./cmd/migrate
	@echo "Built: server/bin/server, server/bin/migrate"

# Go binaries copied into the Electron bundle (see apps/desktop/electron-builder.yml extraResources)
desktop-bundle-go: ## Build server + migrate into apps/desktop/resources/bundled-bin/
	@mkdir -p $(ROOT)/apps/desktop/resources/bundled-bin
	@cd $(ROOT)/server && go build -o $(ROOT)/apps/desktop/resources/bundled-bin/server ./cmd/server
	@cd $(ROOT)/server && go build -o $(ROOT)/apps/desktop/resources/bundled-bin/migrate ./cmd/migrate
	@echo "Bundled Go binaries: apps/desktop/resources/bundled-bin/"

# Packaged app output: apps/desktop/dist/ (e.g. mac-arm64/Open Conductor.app, or .dmg from CI)
desktop-package: desktop-bundle-go ## Build workspace packages + Electron app for this OS/arch (unpacked dir for quick testing)
	@cd $(ROOT) && pnpm exec turbo run build --filter=@open-conductor/core --filter=@open-conductor/ui --filter=@open-conductor/views
	@case "$$(uname -s)_$$(uname -m)" in \
	Darwin_arm64) \
	  cd $(ROOT)/apps/desktop && pnpm exec electron-vite build && pnpm exec electron-builder --config electron-builder.yml --mac dir --arm64 --publish never ;; \
	Darwin_x86_64) \
	  cd $(ROOT)/apps/desktop && pnpm exec electron-vite build && pnpm exec electron-builder --config electron-builder.yml --mac dir --x64 --publish never ;; \
	Linux_x86_64) \
	  cd $(ROOT)/apps/desktop && pnpm exec electron-vite build && pnpm exec electron-builder --config electron-builder.yml --linux AppImage --x64 --publish never ;; \
	*) \
	  echo "desktop-package: no rule for $$(uname -s)/$$(uname -m). See .github/workflows/release.yml for Windows/Linux CI steps."; \
	  exit 1 ;; \
	esac
	@echo "Done. Open the app under apps/desktop/dist/ (see electron-builder output above)."

# ─── Database ─────────────────────────────────────────────────────────────────

migrate-up: ## Run all pending migrations
	@cd $(ROOT)/server && DATABASE_URL="$(DATABASE_URL)" go run ./cmd/migrate

migrate-down: ## Drop all tables (destructive!)
	@read -p "This will drop all tables. Are you sure? [y/N] " confirm && \
	[ "$$confirm" = "y" ] && \
	psql "$(DATABASE_URL)" -f $(ROOT)/server/pkg/db/migrations/001_init.down.sql || echo "Aborted."

# ─── Code generation ──────────────────────────────────────────────────────────

sqlc: ## Regenerate sqlc Go code from SQL queries
	@cd $(ROOT)/server && sqlc generate -f pkg/db/sqlc.yaml

# ─── Testing ──────────────────────────────────────────────────────────────────

test: ## Run Go tests
	@cd $(ROOT)/server && go test ./...

test-ts: ## Run TypeScript tests
	@cd $(ROOT) && pnpm test

typecheck: ## TypeScript type check all packages
	@cd $(ROOT) && pnpm check-types

lint: ## Lint all packages
	@cd $(ROOT) && pnpm lint
	@cd $(ROOT)/server && go vet ./...
