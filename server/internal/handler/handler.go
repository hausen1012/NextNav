package handler

import (
	"io/fs"
	"net/http"
	"path"
	"strings"

	"nextnav/internal/service"
)

// NewAPI constructs the handler set. spaFS is the embedded frontend build.
func NewAPI(svc *service.Service, secure bool, spaFS fs.FS, faviconAllowedDomains string) *API {
	return &API{
		Service:       svc,
		Secure:        secure,
		limiter:       newIPLimiter(),
		spaHandler:    newSPAHandler(spaFS),
		faviconPolicy: newFaviconAccessPolicy(faviconAllowedDomains),
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
			if clean == "sw.js" || clean == "registerSW.js" || clean == "manifest.webmanifest" {
				w.Header().Set("Cache-Control", "no-cache")
			}
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
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\"/><title>NextNav</title></head><body><p style=\"font-family:sans-serif;padding:2rem;text-align:center;color:#666;\">NextNav 前端尚未构建。请运行 <code>npm run build</code> 后启动服务，或使用 Docker 镜像。</p></body></html>"))
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
