package handler

import (
	"net/http"
	"strconv"

	"nextnav/internal/httpx"
	"nextnav/internal/slogx"
)

// --- /api/home ---

func (a *API) Home(w http.ResponseWriter, r *http.Request) {
	admin := httpx.IdentityFrom(r.Context()).IsAdmin()
	data, err := a.Service.GetHome(admin)
	if err != nil {
		slogx.Error("加载首页数据失败", "err", err)
		httpx.Fail(w, http.StatusInternalServerError, "internal", "加载首页失败")
		return
	}
	scope := "public"
	identity := httpx.IdentityFrom(r.Context())
	if admin {
		scope = "private"
		if identity.IsCookieAuth() && identity.SessionExpiry > 0 {
			w.Header().Set("X-NextNav-Session-Expires-At", strconv.FormatInt(identity.SessionExpiry, 10))
		}
	}
	setCacheScope(w, scope)
	httpx.JSON(w, http.StatusOK, data)
}

// --- /api/categories ---

func (a *API) ListCategories(w http.ResponseWriter, r *http.Request) {
	admin := httpx.IdentityFrom(r.Context()).IsAdmin()
	groups, err := a.Service.BuildCategoryTree(admin, false)
	if err != nil {
		slogx.Error("加载分类列表失败", "err", err)
		httpx.Fail(w, http.StatusInternalServerError, "internal", "加载分类失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"groups": groups})
}

// --- /api/admin ---

func (a *API) ListAdminCategories(w http.ResponseWriter, r *http.Request) {
	groups, err := a.Service.ListAdminCategories()
	if err != nil {
		slogx.Error("加载管理端分类失败", "err", err)
		httpx.Fail(w, http.StatusInternalServerError, "internal", "加载分类失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"groups": groups})
}

func (a *API) ListAdminLinks(w http.ResponseWriter, r *http.Request) {
	links, err := a.Service.ListAdminLinks()
	if err != nil {
		slogx.Error("加载管理端链接失败", "err", err)
		httpx.Fail(w, http.StatusInternalServerError, "internal", "加载链接失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": links})
}

// --- /api/settings ---

func (a *API) GetSettings(w http.ResponseWriter, r *http.Request) {
	site := a.Service.GetPublicSite()
	httpx.JSON(w, http.StatusOK, map[string]any{"site": site})
}

func (a *API) GetFetchSettings(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{"fetch": a.Service.GetFetchSettings()})
}

func (a *API) GetSecuritySettings(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{"security": a.Service.GetSecuritySettings()})
}

func parseID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}
