package handler

import (
	"net/http"
	"strconv"
	"testing"
	"time"
)

func TestHomeCacheScopeHeaders(t *testing.T) {
	api, h := newTestAPI(t)
	if err := api.Service.InitAdmin("admin", "nextnav123", false); err != nil {
		t.Fatalf("init admin: %v", err)
	}
	cookie := setupAdmin(t, api, false)

	for _, tc := range []struct {
		name    string
		options reqOpts
		scope   string
	}{
		{name: "访客", options: reqOpts{}, scope: "public"},
		{name: "管理员", options: reqOpts{cookie: cookie}, scope: "private"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := do(t, h, http.MethodGet, "/api/home", tc.options)
			if rec.Code != http.StatusOK {
				t.Fatalf("状态码 = %d，期望 200", rec.Code)
			}
			if got := rec.Header().Get("X-NextNav-Data-Scope"); got != tc.scope {
				t.Fatalf("缓存范围 = %q，期望 %q", got, tc.scope)
			}
			if tc.scope == "private" {
				if got := rec.Header().Get("X-NextNav-Session-Expires-At"); got == "" {
					t.Fatal("私有首页缺少会话到期时间")
				}
			}
			if got := rec.Header().Get("Cache-Control"); got != "private, no-cache" {
				t.Fatalf("Cache-Control = %q", got)
			}
			if got := rec.Header().Values("Vary"); len(got) != 1 || got[0] != "Cookie" {
				t.Fatalf("Vary = %v，期望 Cookie", got)
			}
		})
	}
}

func TestMeReturnsCookieSessionExpiry(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, false)
	before := time.Now().Add(29 * 24 * time.Hour).UnixMilli()

	rec := do(t, h, http.MethodGet, "/api/me", reqOpts{cookie: cookie})
	if rec.Code != http.StatusOK {
		t.Fatalf("状态码 = %d，期望 200", rec.Code)
	}
	response := decode[struct {
		Auth      string `json:"auth"`
		ExpiresAt int64  `json:"expiresAt"`
	}](t, rec)
	if response.Auth != "admin" {
		t.Fatalf("身份 = %q，期望 admin", response.Auth)
	}
	if response.ExpiresAt < before || response.ExpiresAt > time.Now().Add(30*24*time.Hour).UnixMilli()+1 {
		t.Fatalf("会话到期时间超出预期: %d", response.ExpiresAt)
	}
	if got := rec.Header().Get("X-NextNav-Data-Scope"); got != "private" {
		t.Fatalf("缓存范围 = %q，期望 private", got)
	}
	if got := rec.Header().Get("X-NextNav-Session-Expires-At"); got != strconv.FormatInt(response.ExpiresAt, 10) {
		t.Fatalf("会话到期头 = %q，期望 %d", got, response.ExpiresAt)
	}
}

func TestLoginReturnsSessionExpiry(t *testing.T) {
	api, h := newTestAPI(t)
	if err := api.Service.InitAdmin("admin", "nextnav123", false); err != nil {
		t.Fatalf("init admin: %v", err)
	}

	rec := do(t, h, http.MethodPost, "/api/login", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("状态码 = %d，期望 200", rec.Code)
	}
	response := decode[struct {
		ExpiresAt int64 `json:"expiresAt"`
	}](t, rec)
	if response.ExpiresAt <= time.Now().UnixMilli() {
		t.Fatalf("会话到期时间无效: %d", response.ExpiresAt)
	}
	if response.ExpiresAt%1000 != 0 {
		t.Fatalf("会话到期时间应与 Cookie 精度一致: %d", response.ExpiresAt)
	}
}

func TestPasswordChangeReturnsSessionExpiry(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, false)

	rec := do(t, h, http.MethodPost, "/api/settings/account", reqOpts{
		cookie:    cookie,
		origin:    "http://example.com",
		fetchSite: "same-origin",
		body: map[string]string{
			"currentPassword": "nextnav123",
			"newPassword":     "changedpass123",
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("状态码 = %d，期望 200", rec.Code)
	}
	response := decode[struct {
		ExpiresAt int64 `json:"expiresAt"`
	}](t, rec)
	if response.ExpiresAt <= time.Now().UnixMilli() {
		t.Fatalf("会话到期时间无效: %d", response.ExpiresAt)
	}
	if got := rec.Header().Get("X-NextNav-Session-Expires-At"); got != "" {
		t.Fatalf("改密响应不应包含缓存会话到期头: %q", got)
	}
}
