package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// ServeIcon serves cached icons from data/icons with immutable caching.
// Only paths that resolve inside the icons directory are served.
func (a *API) ServeIcon(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/icons/")
	if rel == "" || strings.Contains(rel, "..") {
		http.NotFound(w, r)
		return
	}
	full := filepath.Join(a.Service.DataDir(), "icons", filepath.FromSlash(rel))

	// Defense in depth: confirm the resolved path stays under the icons dir.
	base := filepath.Join(a.Service.DataDir(), "icons")
	absBase, err1 := filepath.Abs(base)
	absFull, err2 := filepath.Abs(full)
	if err1 != nil || err2 != nil || !strings.HasPrefix(absFull, absBase+string(os.PathSeparator)) {
		http.NotFound(w, r)
		return
	}

	info, err := os.Stat(absFull)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, absFull)
}
