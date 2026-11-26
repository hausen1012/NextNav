package handler

import (
	"net"
	"net/http"
	"net/url"
	"strconv"
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
			if _, expiresAt, ok := auth.VerifySession(a.cookieKey(), c.Value); ok {
				id = httpx.Identity{Admin: true, Method: httpx.AuthCookie, SessionExpiry: expiresAt.UnixMilli()}
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
	expectedHost := r.Header.Get("X-Forwarded-Host")
	if expectedHost == "" {
		expectedHost = r.Host
	}
	if u, err := url.Parse(origin); err == nil && u.Host != "" {
		if strings.EqualFold(u.Host, expectedHost) {
			return true
		}
	}
	trimmed := strings.TrimSuffix(origin, "/")
	return trimmed == "http://"+expectedHost || trimmed == "https://"+expectedHost
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
	expiresAt := a.issueSession(w, r)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"user":      map[string]string{"username": storedUser},
		"expiresAt": expiresAt,
	})
}

// requestIsSecure reports whether the request arrived over HTTPS, either
// directly or through a reverse proxy that sets X-Forwarded-Proto.
func requestIsSecure(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(strings.Split(proto, ",")[0]), "https")
}

func (a *API) issueSession(w http.ResponseWriter, r *http.Request) int64 {
	expiresAt := time.Now().Add(sessionTTL).Truncate(time.Second)
	value := auth.SignSession(a.cookieKey(), expiresAt, "admin")
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   requestIsSecure(r),
		MaxAge:   int(sessionTTL / time.Second),
	})
	return expiresAt.UnixMilli()
}

func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   requestIsSecure(r),
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	id := httpx.IdentityFrom(r.Context())
	if !id.IsAdmin() {
		setCacheScope(w, "public")
		httpx.JSON(w, http.StatusOK, map[string]string{"auth": "guest"})
		return
	}
	scope := "public"
	response := map[string]any{
		"auth":       "admin",
		"authMethod": id.Method,
		"username":   a.Service.GetAdminUsername(),
	}
	if id.IsCookieAuth() && id.SessionExpiry > 0 {
		scope = "private"
		response["expiresAt"] = id.SessionExpiry
		w.Header().Set("X-NextNav-Session-Expires-At", strconv.FormatInt(id.SessionExpiry, 10))
	}
	setCacheScope(w, scope)
	httpx.JSON(w, http.StatusOK, response)
}

func setCacheScope(w http.ResponseWriter, scope string) {
	w.Header().Set("X-NextNav-Data-Scope", scope)
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Add("Vary", "Cookie")
}

func isPrivateOrLocalIP(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
}

func clientIP(r *http.Request) string {
	remoteHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remoteHost = r.RemoteAddr
	}

	// 仅当前置连接来自本地回环或私有内网地址（表明请求经由本机/内网反向代理转发）时，
	// 才信任反向代理透传的 X-Real-IP / X-Forwarded-For；
	// 否则直接以远程连接 IP 为准，防止公网直连客户端伪造请求头绕过防爆破限流。
	if isPrivateOrLocalIP(remoteHost) {
		if xrip := strings.TrimSpace(r.Header.Get("X-Real-IP")); xrip != "" {
			if net.ParseIP(xrip) != nil {
				return xrip
			}
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if net.ParseIP(p) != nil {
					return p
				}
			}
		}
	}
	return remoteHost
}
