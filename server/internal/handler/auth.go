package handler

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"nextnav/internal/auth"
	"nextnav/internal/httpx"
)

const sessionCookieName = "nn_session"
const sessionTTL = 30 * 24 * time.Hour

func (a *API) cookieKey() []byte {
	v := a.Store.GetSetting("secret.cookie_key", "")
	raw, err := hex.DecodeString(v)
	if err != nil || len(raw) != 32 {
		// Should not happen: ensureSecrets creates it at startup.
		slog.Error("invalid cookie key, sessions will not persist")
		return []byte(v)
	}
	return raw
}

// Auth identifies the caller (token, then cookie, then guest) and stores the
// result in the request context. It never rejects the request; enforcement
// happens in RequireAdmin and in the service layer.
func (a *API) Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := httpx.Identity{Method: httpx.AuthNone}

		if bearer := bearerToken(r); bearer != "" {
			if a.tokenValid(bearer) {
				id = httpx.Identity{Admin: true, Method: httpx.AuthToken}
			}
		} else if c, err := r.Cookie(sessionCookieName); err == nil && c.Value != "" {
			if _, ok := auth.VerifySession(a.cookieKey(), c.Value); ok {
				id = httpx.Identity{Admin: true, Method: httpx.AuthCookie}
			}
		}

		next.ServeHTTP(w, r.WithContext(httpx.WithIdentity(r.Context(), id)))
	})
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// tokenValid compares sha256(token) against the stored hash in constant time.
func (a *API) tokenValid(token string) bool {
	var stored string
	err := a.Store.DB.QueryRow(`SELECT token_hash FROM api_token WHERE id = 1`).Scan(&stored)
	if err != nil {
		return false
	}
	sum := sha256.Sum256([]byte(token))
	if !constantTimeEqualHex(hex.EncodeToString(sum[:]), stored) {
		return false
	}
	// Best-effort usage timestamp; failures are not security relevant.
	_, _ = a.Store.DB.Exec(`UPDATE api_token SET last_used_at = ? WHERE id = 1`, time.Now().UnixMilli())
	return true
}

func constantTimeEqualHex(got, want string) bool {
	if len(got) != len(want) {
		return false
	}
	var v byte
	for i := 0; i < len(got); i++ {
		v |= got[i] ^ want[i]
	}
	return v == 0
}

// RequireAdmin rejects guests and enforces nothing else.
func (a *API) RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !httpx.IdentityFrom(r.Context()).IsAdmin() {
			httpx.Fail(w, http.StatusUnauthorized, "unauthorized", "需要登录")
			return
		}
		next(w, r)
	}
}

// CSRF rejects state-changing cookie requests whose origin is not the site.
// Token requests are exempt: the credential is explicit and never attached
// automatically by the browser.
func (a *API) CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if !httpx.IdentityFrom(r.Context()).IsCookieAuth() {
			next.ServeHTTP(w, r)
			return
		}
		if !sameOrigin(r) {
			httpx.Fail(w, http.StatusForbidden, "csrf_failed", "会话已失效，请重新登录")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// sameOrigin accepts requests that either declare same-origin via
// Sec-Fetch-Site (modern browsers) or carry a matching Origin header.
// A request with neither header is a non-browser client and is allowed.
func sameOrigin(r *http.Request) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" {
		return site == "same-origin" || site == "none"
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	host := r.Host
	if i := strings.Index(host, ":"); i > 0 {
		// keep the port, but be tolerant of a missing scheme in Origin
	}
	return strings.TrimSuffix(origin, "/") == "http://"+host ||
		strings.TrimSuffix(origin, "/") == "https://"+host
}

// --- handlers ---

type setupStatusResp struct {
	Installed bool `json:"installed"`
}

func (a *API) SetupStatus(w http.ResponseWriter, r *http.Request) {
	n, err := a.Store.AdminCount()
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "读取安装状态失败")
		return
	}
	httpx.JSON(w, http.StatusOK, setupStatusResp{Installed: n > 0})
}

type setupReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (a *API) Setup(w http.ResponseWriter, r *http.Request) {
	n, err := a.Store.AdminCount()
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "读取安装状态失败")
		return
	}
	if n > 0 {
		httpx.Fail(w, http.StatusConflict, "already_installed", "站点已完成安装")
		return
	}

	var req setupReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || len([]rune(req.Username)) > 32 {
		httpx.FailField(w, http.StatusBadRequest, "invalid_name", "用户名需为 1–32 个字符", "username")
		return
	}
	if len(req.Password) < 8 {
		httpx.FailField(w, http.StatusBadRequest, "invalid_password", "密码至少 8 位", "password")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "创建账号失败")
		return
	}

	now := time.Now().UnixMilli()
	if _, err := a.Store.DB.Exec(
		`INSERT INTO admin(id, username, password_hash, created_at, updated_at) VALUES(1, ?, ?, ?, ?)`,
		req.Username, hash, now, now,
	); err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "创建账号失败")
		return
	}

	// Insert demo content. A failure here should not lock the operator out of
	// a freshly created install, so log and continue.
	if err := a.Store.SeedSample(); err != nil {
		slog.Error("seed sample data", "err", err)
	}

	a.issueSession(w, r)
	httpx.JSON(w, http.StatusCreated, map[string]any{
		"user": map[string]string{"username": req.Username},
	})
}

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	if a.limiter.blocked(clientIP(r)) {
		httpx.Fail(w, http.StatusTooManyRequests, "rate_limited", "登录尝试过于频繁，请稍后再试")
		return
	}

	var req loginReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}
	req.Username = strings.TrimSpace(req.Username)

	var storedUser, storedHash string
	err := a.Store.DB.QueryRow(
		`SELECT username, password_hash FROM admin WHERE id = 1`,
	).Scan(&storedUser, &storedHash)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "登录失败")
		return
	}

	ok := err == nil &&
		strings.EqualFold(storedUser, req.Username) &&
		auth.VerifyPassword(storedHash, req.Password)
	if !ok {
		a.limiter.fail(clientIP(r))
		httpx.Fail(w, http.StatusUnauthorized, "bad_credentials", "用户名或密码错误")
		return
	}

	a.limiter.reset(clientIP(r))
	a.issueSession(w, r)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"user": map[string]string{"username": storedUser},
	})
}

func (a *API) issueSession(w http.ResponseWriter, r *http.Request) {
	value := auth.SignSession(a.cookieKey(), time.Now().Add(sessionTTL), "admin")
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   a.Secure,
		MaxAge:   int(sessionTTL / time.Second),
	})
}

func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   a.Secure,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	id := httpx.IdentityFrom(r.Context())
	if !id.IsAdmin() {
		httpx.JSON(w, http.StatusOK, map[string]string{"auth": "guest"})
		return
	}
	username := "admin"
	_ = a.Store.DB.QueryRow(`SELECT username FROM admin WHERE id = 1`).Scan(&username)
	httpx.JSON(w, http.StatusOK, map[string]string{
		"auth":       "admin",
		"authMethod": id.Method,
		"username":   username,
	})
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
