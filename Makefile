.PHONY: dev setup server build test migrate-up migrate-down sqlc

# Load .env from project root if present (exports all vars to subprocesses)
-include .env
export

# ─── Setup ────────────────────────────────────────────────────────────────────

setup: ## First-time project setup
	@cp -n .env.example .env 2>/dev/null || true
	@pnpm install
	@docker compose up -d
	@sleep 3
	@$(MAKE) migrate-up
	@echo "Setup complete. Run 'make dev' to start."

# ─── Development ──────────────────────────────────────────────────────────────

dev: ## Start backend + desktop in dev mode
	@make server &
	@pnpm --filter @open-conductor/desktop dev

server: ## Start Go API server
	@cd server && go run ./cmd/server/...

# ─── Build ────────────────────────────────────────────────────────────────────

build: ## Build Go binaries to server/bin/
	@mkdir -p server/bin
	@cd server && go build -o bin/server ./cmd/server/...
	@cd server && go build -o bin/migrate ./cmd/migrate/...
	@echo "Built: server/bin/server, server/bin/migrate"

# ─── Database ─────────────────────────────────────────────────────────────────

migrate-up: ## Run all pending migrations
	@cd server && DATABASE_URL="$(DATABASE_URL)" go run ./cmd/migrate/...

migrate-down: ## Drop all tables (destructive!)
	@read -p "This will drop all tables. Are you sure? [y/N] " confirm && \
	[ "$$confirm" = "y" ] && \
	psql "$(DATABASE_URL)" -f server/pkg/db/migrations/001_init.down.sql || echo "Aborted."

# ─── Code generation ──────────────────────────────────────────────────────────

sqlc: ## Regenerate sqlc Go code from SQL queries
	@cd server && sqlc generate -f pkg/db/sqlc.yaml

# ─── Testing ──────────────────────────────────────────────────────────────────

test: ## Run Go tests
	@cd server && go test ./...

test-ts: ## Run TypeScript tests
	@pnpm test

typecheck: ## TypeScript type check all packages
	@pnpm check-types

lint: ## Lint all packages
	@pnpm lint
	@cd server && go vet ./...
