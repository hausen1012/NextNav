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

// AccessLog logs one line per request to stdout. Static asset requests are
// logged at debug level to keep production logs readable.
func (a *API) AccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)

		level := slog.LevelInfo
		if isStaticOrHealth(r.URL.Path) {
			level = slog.LevelDebug
		}
		slog.Log(r.Context(), level, "http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"ms", time.Since(start).Milliseconds(),
		)
	})
}
