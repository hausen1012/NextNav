package handler

import (
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
	return a.Service.CookieKey()
}

// Auth identifies the caller (token, then cookie, then guest) and stores the
// result in the request context. It never rejects the request; enforcement
// happens in RequireAdmin and in the service layer.
func (a *API) Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := httpx.Identity{Method: httpx.AuthNone}

		if bearer := bearerToken(r); bearer != "" {
			if a.Service.VerifyToken(bearer) {
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

func sameOrigin(r *http.Request) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" {
		return site == "same-origin" || site == "none"
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	host := r.Host
	return strings.TrimSuffix(origin, "/") == "http://"+host ||
		strings.TrimSuffix(origin, "/") == "https://"+host
}

// --- handlers ---

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if a.limiter.blocked(ip) {
		httpx.Fail(w, http.StatusTooManyRequests, "rate_limited", "登录尝试过于频繁，请稍后再试")
		return
	}

	var req loginReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}
	req.Username = strings.TrimSpace(req.Username)

	storedUser, ok := a.Service.Authenticate(req.Username, req.Password)
	if !ok {
		a.limiter.fail(ip)
		httpx.Fail(w, http.StatusUnauthorized, "bad_credentials", "用户名或密码错误")
		return
	}

	a.limiter.reset(ip)
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
	username := a.Service.GetAdminUsername()
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
