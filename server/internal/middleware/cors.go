package middleware

import (
	"net/http"
	"os"
	"strings"
)

func CORS() func(http.Handler) http.Handler {
	allowedOrigin := os.Getenv("CORS_ORIGIN")

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			// Determine which origin to reflect
			allowed := resolveOrigin(origin, allowedOrigin)
			if allowed != "" {
				w.Header().Set("Access-Control-Allow-Origin", allowed)
				w.Header().Set("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// resolveOrigin returns the origin to allow.
// - In dev (no CORS_ORIGIN set, or CORS_ORIGIN=*): reflect any localhost origin.
// - In production: only reflect if origin matches CORS_ORIGIN exactly.
// - Packaged Electron app sends no Origin header: allow unconditionally.
func resolveOrigin(origin, configured string) string {
	// No origin header (e.g. packaged Electron, curl) — no CORS header needed
	if origin == "" {
		return ""
	}

	// Wildcard / no config: allow any localhost in dev
	if configured == "" || configured == "*" {
		if isLocalhost(origin) {
			return origin
		}
		return "*"
	}

	// Exact match
	if origin == configured {
		return origin
	}

	// Also allow any localhost when in dev mode (CORS_ORIGIN starts with localhost/127)
	if isLocalhost(configured) && isLocalhost(origin) {
		return origin
	}

	return configured
}

func isLocalhost(origin string) bool {
	return strings.HasPrefix(origin, "http://localhost") ||
		strings.HasPrefix(origin, "http://127.0.0.1") ||
		strings.HasPrefix(origin, "https://localhost")
}
