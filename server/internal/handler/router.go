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

	// --- write: links ---
	mux.HandleFunc("POST /api/links", a.RequireAdmin(a.CreateLink))
	mux.HandleFunc("PATCH /api/links/{id}", a.RequireAdmin(a.UpdateLink))
	mux.HandleFunc("DELETE /api/links/{id}", a.RequireAdmin(a.DeleteLink))
	mux.HandleFunc("POST /api/links/batch-delete", a.RequireAdmin(a.BatchDeleteLinks))
	mux.HandleFunc("POST /api/links/batch-move", a.RequireAdmin(a.BatchMoveLinks))

	// --- health checks ---
	mux.HandleFunc("POST /api/links/{id}/check", a.RequireAdmin(a.CheckLink))
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
	mux.HandleFunc("POST /api/settings/account", a.RequireAdmin(a.UpdateAccount))

	// --- icons & sample data ---
	mux.HandleFunc("GET /icons/", a.ServeIcon)
	mux.HandleFunc("POST /api/sample/clear", a.RequireAdmin(a.ClearSample))

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
