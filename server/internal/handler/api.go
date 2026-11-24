package handler

import (
	"net/http"
	"path/filepath"
	"strings"

	"nextnav/internal/store"
)

// API holds every dependency a handler needs.
type API struct {
	Store      *store.Store
	Secure     bool
	limiter    *ipLimiter
	spaHandler http.Handler
}

// PublicSite is the subset of settings safe to expose to guests.
type PublicSite struct {
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	Background   string  `json:"background"`
	LogoURL      *string `json:"logoUrl"`
	OpenInNewTab bool    `json:"openInNewTab"`
}

func (a *API) publicSite() PublicSite {
	name := a.Store.GetSetting("site.name", "NextNav")
	desc := a.Store.GetSetting("site.description", "")
	bg := a.Store.GetSetting("site.background", "")
	logo := a.Store.GetSetting("site.logo_path", "")
	openNew := a.Store.GetSetting("link.open_in_new_tab", "1") == "1"

	var logoURL *string
	if logo != "" {
		u := "/" + strings.TrimPrefix(filepath.ToSlash(logo), "/")
		logoURL = &u
	}

	return PublicSite{
		Name:         name,
		Description:  desc,
		Background:   bg,
		LogoURL:      logoURL,
		OpenInNewTab: openNew,
	}
}

// iconURL converts a stored icon path into a public URL, or nil.
func iconURL(path string) *string {
	if path == "" {
		return nil
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") || strings.HasPrefix(path, "data:") {
		return &path
	}
	// If it doesn't look like a file path (no slashes and no file extension), return as-is for emoji / icon name
	if !strings.Contains(path, "/") && !strings.Contains(path, "\\") && !strings.Contains(path, ".") {
		return &path
	}
	u := "/" + strings.TrimPrefix(filepath.ToSlash(path), "/")
	return &u
}
