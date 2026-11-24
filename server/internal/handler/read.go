package handler

import (
	"net/http"
	"strconv"

	"nextnav/internal/httpx"
)

// --- /api/home ---

func (a *API) Home(w http.ResponseWriter, r *http.Request) {
	admin := httpx.IdentityFrom(r.Context()).IsAdmin()
	data, err := a.Service.GetHome(admin)
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "加载首页失败")
		return
	}
	httpx.JSON(w, http.StatusOK, data)
}

// --- /api/categories ---

func (a *API) ListCategories(w http.ResponseWriter, r *http.Request) {
	admin := httpx.IdentityFrom(r.Context()).IsAdmin()
	groups, err := a.Service.BuildCategoryTree(admin, false)
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "加载分类失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"groups": groups})
}

// --- /api/settings ---

func (a *API) GetSettings(w http.ResponseWriter, r *http.Request) {
	site := a.Service.GetPublicSite()
	httpx.JSON(w, http.StatusOK, map[string]any{"site": site})
}

func parseID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}
