package handler

import (
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"nextnav/internal/httpx"
	"nextnav/internal/service"
)

// UploadLinkIcon replaces a link's icon with a user-supplied image.
func (a *API) UploadLinkIcon(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, http.StatusNotFound, "not_found", "链接不存在")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024+1024)
	if err := r.ParseMultipartForm(1024 * 1024); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "file_too_large", "文件大小不能超过 1MB")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请上传文件 (file 字段)")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, 1024*1024+1))
	if err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "读取上传文件失败")
		return
	}

	d, err := a.Service.SaveLinkIconUpload(id, data, header.Filename)
	switch {
	case errors.Is(err, service.ErrNotFound):
		httpx.Fail(w, http.StatusNotFound, "not_found", "链接不存在")
	case errors.Is(err, service.ErrImageTooLarge):
		httpx.Fail(w, http.StatusBadRequest, "file_too_large", "文件大小不能超过 1MB")
	case errors.Is(err, service.ErrInvalidImageType):
		httpx.Fail(w, http.StatusBadRequest, "invalid_type", "仅支持 PNG、JPEG、WebP 或 ICO 格式的图片")
	case err != nil:
		httpx.Fail(w, http.StatusInternalServerError, "internal", "保存图标失败")
	default:
		httpx.JSON(w, http.StatusOK, d)
	}
}

// ClearLinkIcon removes a link's custom icon so the card falls back to the
// letter placeholder.
func (a *API) ClearLinkIcon(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, http.StatusNotFound, "not_found", "链接不存在")
		return
	}
	d, err := a.Service.SetLinkIcon(id, nil)
	if errors.Is(err, service.ErrNotFound) {
		httpx.Fail(w, http.StatusNotFound, "not_found", "链接不存在")
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "清除图标失败")
		return
	}
	httpx.JSON(w, http.StatusOK, d)
}

// PurgeOrphanIcons deletes cached icon files that no row references.
func (a *API) PurgeOrphanIcons(w http.ResponseWriter, r *http.Request) {
	removed, err := a.Service.PurgeOrphanIcons()
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "清理图标缓存失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"removed": removed})
}

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

// ServeFavicon fetches or serves cached favicon for the specified domain.
// Example paths: /api/favicon/www.baidu.com.ico, /api/favicon/github.com.png, /api/favicon/example.com
func (a *API) ServeFavicon(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimPrefix(r.URL.Path, "/api/favicon/")
	raw = strings.TrimSpace(raw)
	if raw == "" {
		httpx.Fail(w, http.StatusBadRequest, "invalid_domain", "缺少目标域名")
		return
	}

	// Strip optional image extension (.ico, .png, .jpg, .jpeg, .webp)
	lower := strings.ToLower(raw)
	for _, ext := range []string{".ico", ".png", ".jpg", ".jpeg", ".webp"} {
		if strings.HasSuffix(lower, ext) {
			raw = raw[:len(raw)-len(ext)]
			break
		}
	}

	domain, err := service.CleanDomain(raw)
	if err != nil {
		httpx.Fail(w, http.StatusBadRequest, "invalid_domain", "无效的域名格式")
		return
	}

	iconPath, err := a.Service.GetOrFetchFavicon(r.Context(), domain)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	full := filepath.Join(a.Service.DataDir(), filepath.FromSlash(iconPath))
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}

	ext := strings.ToLower(filepath.Ext(full))
	contentType := "image/x-icon"
	switch ext {
	case ".png":
		contentType = "image/png"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".webp":
		contentType = "image/webp"
	case ".ico":
		contentType = "image/x-icon"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, full)
}
