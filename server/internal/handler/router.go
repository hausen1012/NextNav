package handler

import (
	"net/http"

	"nextnav/internal/httpx"
)

// NewRouter builds the full HTTP surface: API routes, icon files and the
// embedded SPA fallback.
func NewRouter(a *API) http.Handler {
	mux := http.NewServeMux()

	// --- public / auth ---
	mux.HandleFunc("GET /api/health", a.Health)
	mux.HandleFunc("POST /api/login", a.Login)
	mux.HandleFunc("POST /api/logout", a.Logout)
	mux.HandleFunc("GET /api/me", a.Me)

	// --- read ---
	mux.HandleFunc("GET /api/home", a.Home)
	mux.HandleFunc("GET /api/settings", a.GetSettings)
	mux.HandleFunc("GET /api/categories", a.ListCategories)

	// --- admin: management reads ---
	mux.HandleFunc("GET /api/admin/categories", a.RequireAdmin(a.ListAdminCategories))
	mux.HandleFunc("GET /api/admin/links", a.RequireAdmin(a.ListAdminLinks))

	// --- write: links ---
	mux.HandleFunc("POST /api/links", a.RequireAdmin(a.CreateLink))
	mux.HandleFunc("PATCH /api/links/{id}", a.RequireAdmin(a.UpdateLink))
	mux.HandleFunc("DELETE /api/links/{id}", a.RequireAdmin(a.DeleteLink))
	mux.HandleFunc("POST /api/links/batch-delete", a.RequireAdmin(a.BatchDeleteLinks))
	mux.HandleFunc("POST /api/links/batch-move", a.RequireAdmin(a.BatchMoveLinks))
	mux.HandleFunc("POST /api/links/{id}/icon", a.RequireAdmin(a.UploadLinkIcon))
	mux.HandleFunc("DELETE /api/links/{id}/icon", a.RequireAdmin(a.ClearLinkIcon))
	mux.HandleFunc("POST /api/meta", a.RequireAdmin(a.FetchMeta))

	// --- health checks ---
	mux.HandleFunc("POST /api/links/check-all", a.RequireAdmin(a.CheckAll))
	mux.HandleFunc("GET /api/check/status", a.RequireAdmin(a.GetCheckStatus))
	mux.HandleFunc("GET /api/checks", a.RequireAdmin(a.ListChecks))

	// --- write: categories ---
	mux.HandleFunc("POST /api/categories", a.RequireAdmin(a.CreateCategory))
	mux.HandleFunc("PATCH /api/categories/{id}", a.RequireAdmin(a.UpdateCategory))
	mux.HandleFunc("DELETE /api/categories/{id}", a.RequireAdmin(a.DeleteCategory))

	// --- tokens ---
	mux.HandleFunc("GET /api/tokens", a.RequireAdmin(a.GetToken))
	mux.HandleFunc("POST /api/tokens", a.RequireAdmin(a.CreateToken))
	mux.HandleFunc("DELETE /api/tokens", a.RequireAdmin(a.DeleteToken))

	// --- backup & migration ---
	mux.HandleFunc("GET /api/backup/export", a.RequireAdmin(a.ExportBackup))
	mux.HandleFunc("POST /api/backup/import", a.RequireAdmin(a.ImportBackup))

	// --- settings ---
	mux.HandleFunc("PATCH /api/settings", a.RequireAdmin(a.UpdateSettings))
	mux.HandleFunc("GET /api/settings/fetch", a.RequireAdmin(a.GetFetchSettings))
	mux.HandleFunc("PATCH /api/settings/fetch", a.RequireAdmin(a.UpdateFetchSettings))
	mux.HandleFunc("GET /api/settings/security", a.RequireAdmin(a.GetSecuritySettings))
	mux.HandleFunc("PATCH /api/settings/security", a.RequireAdmin(a.UpdateSecuritySettings))
	mux.HandleFunc("POST /api/settings/logo", a.RequireAdmin(a.UploadLogo))
	mux.HandleFunc("DELETE /api/settings/logo", a.RequireAdmin(a.RemoveLogo))
	mux.HandleFunc("POST /api/settings/account", a.RequireAdmin(a.UpdateAccount))

	// --- icons ---
	mux.HandleFunc("GET /icons/", a.ServeIcon)
	mux.HandleFunc("GET /api/favicon/", a.faviconAccess(a.ServeFavicon))
	mux.HandleFunc("POST /api/icons/purge", a.RequireAdmin(a.PurgeOrphanIcons))

	// Everything else is the SPA (client-side routing + static assets).
	mux.Handle("/", a.spaHandler)

	// Middleware order matters: AccessLog → Auth → CSRF → mux.
	// CSRF needs the identity that Auth writes into the context, so it must
	// run inside Auth.
	var root http.Handler = mux
	root = a.CSRF(root)
	root = a.Auth(root)
	root = a.AccessLog(root)
	return root
}

func (a *API) Health(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
