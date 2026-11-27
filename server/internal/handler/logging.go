package handler

import (
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func isStaticOrHealth(p string) bool {
	if p == "/api/health" {
		return true
	}
	if strings.HasPrefix(p, "/assets/") || strings.HasPrefix(p, "/icons/") {
		return true
	}
	ext := path.Ext(p)
	switch ext {
	case ".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".webmanifest", ".map":
		return true
	}
	return false
}

// AccessLog logs one line per request to stdout.
// By default, successful requests (< 400) and static assets are logged at DEBUG
// level so production logs are clean and not spammed by routine traffic.
// Client errors (4xx) are logged at WARN level, and server errors (5xx) at ERROR level.
func (a *API) AccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)

		level := slog.LevelDebug
		if rec.status >= 500 {
			level = slog.LevelError
		} else if rec.status >= 400 {
			if isStaticOrHealth(r.URL.Path) {
				level = slog.LevelDebug
			} else {
				level = slog.LevelWarn
			}
		}
		slog.Log(r.Context(), level, "http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"ms", time.Since(start).Milliseconds(),
		)
	})
}
