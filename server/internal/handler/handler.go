package handler

import (
	"io/fs"
	"net/http"
	"path"
	"strings"

	"nextnav/internal/store"
)

// NewAPI constructs the handler set. spaFS is the embedded frontend build.
func NewAPI(st *store.Store, secure bool, spaFS fs.FS) *API {
	return &API{
		Store:      st,
		Secure:     secure,
		limiter:    newIPLimiter(),
		spaHandler: newSPAHandler(spaFS),
	}
}

// newSPAHandler serves static assets from the embedded FS and falls back to
// index.html for client-side routes.
func newSPAHandler(spaFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(spaFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if clean == "" || clean == "." {
			clean = "index.html"
		}
		if f, err := spaFS.Open(clean); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// Unknown path: hand it to the SPA router.
		serveIndex(w, r, spaFS)
	})
}

func serveIndex(w http.ResponseWriter, r *http.Request, spaFS fs.FS) {
	data, err := fs.ReadFile(spaFS, "index.html")
	if err != nil {
		http.Error(w, "frontend bundle missing", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
