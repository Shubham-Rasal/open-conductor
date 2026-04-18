package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"

	"github.com/Shubham-Rasal/open-conductor/server/internal/handler"
	appMiddleware "github.com/Shubham-Rasal/open-conductor/server/internal/middleware"
	"github.com/Shubham-Rasal/open-conductor/server/internal/runner"
	"github.com/Shubham-Rasal/open-conductor/server/internal/service"
	"github.com/Shubham-Rasal/open-conductor/server/internal/sqliteutil"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

func main() {
	_ = godotenv.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	if cwd, err := os.Getwd(); err == nil {
		slog.Info("current directory", "path", cwd)
	}

	// Database
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	sqldb, err := sqliteutil.Open(dbURL)
	if err != nil {
		slog.Error("connect to db", "err", err)
		os.Exit(1)
	}
	defer func() { _ = sqldb.Close() }()

	if err := sqldb.PingContext(context.Background()); err != nil {
		slog.Error("ping db", "err", err)
		os.Exit(1)
	}

	queries := db.New(sqldb)
	taskSvc := service.NewTaskService(queries, handler.Broadcast)

	// Bootstrap: ensure a guest user and default local workspace exist.
	guestUser, err := queries.UpsertGuestUser(context.Background())
	if err != nil {
		slog.Error("bootstrap guest user", "err", err)
		os.Exit(1)
	}
	slog.Info("guest user ready", "id", guestUser.ID)

	store := &handler.Store{Q: queries, TaskService: taskSvc}

	// Resume runners for any runtimes that were online before restart
	go func() {
		runtimes, err := queries.ListOnlineAgentRuntimes(context.Background())
		if err != nil {
			slog.Warn("could not load online runtimes", "err", err)
			return
		}
		for _, rt := range runtimes {
			var conn *string
			if rt.ConnectionUrl.Valid {
				s := rt.ConnectionUrl.String
				conn = &s
			}
			runner.Global.Start(context.Background(), queries, rt.ID, rt.AgentID, rt.WorkspaceID, rt.Provider, rt.WorkspaceType, conn, handler.Broadcast)
		}
		slog.Info("resumed runners", "count", len(runtimes))
	}()

	// Offline sweep: mark stale runtimes offline every 60s
	sweepCtx, sweepCancel := context.WithCancel(context.Background())
	defer sweepCancel()
	go func() {
		t := time.NewTicker(60 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-sweepCtx.Done():
				return
			case <-t.C:
				_ = queries.MarkAgentRuntimeOffline(context.Background())
			}
		}
	}()

	// Router
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.CleanPath) // e.g. /api/workspaces/<id>//agents → match route
	r.Use(appMiddleware.Logger(logger))
	r.Use(appMiddleware.CORS())

	jwtSecret := os.Getenv("JWT_SECRET")
	guestUserIDStr := guestUser.ID

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		dbOK := sqldb.PingContext(r.Context()) == nil
		dbStatus := "ok"
		if !dbOK {
			dbStatus = "error"
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","db":"` + dbStatus + `"}`))
	})

	r.Get("/ws", handler.HandleWebSocket)

	r.Route("/api", func(r chi.Router) {
		handler.RegisterAuthRoutes(r, store)

		// Public: optional slug "local" workspace id (no auto-create; null until user creates one)
		r.Get("/local", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			ws, err := queries.GetWorkspaceBySlug(r.Context(), "local")
			if err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					_, _ = w.Write([]byte(`{"workspace_id":null}`))
					return
				}
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			_, _ = w.Write([]byte(`{"workspace_id":"` + ws.ID + `"}`))
		})

		// Planning assistant tools (no JWT, no token — workspace + stream id in URL).
		handler.RegisterAssistantToolRoutes(r, store)

		// All other routes: optional auth — works without login, falls back to guest user
		r.Group(func(r chi.Router) {
			r.Use(appMiddleware.OptionalAuth(jwtSecret, guestUserIDStr))
			handler.RegisterWorkspaceRoutes(r, store)
			handler.RegisterChatRoutes(r, store)
			handler.RegisterIssueRoutes(r, store)
			handler.RegisterAgentRoutes(r, store)
			handler.RegisterCommentRoutes(r, store)
			handler.RegisterDaemonRoutes(r, store)
		})
	})

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("server starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-done
	slog.Info("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("shutdown error", "err", err)
	}
}
