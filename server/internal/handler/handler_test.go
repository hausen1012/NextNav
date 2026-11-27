package handler

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"nextnav/internal/httpx"
	"nextnav/internal/service"
	"nextnav/internal/store"
	"testing/fstest"
)

// newTestAPI creates an isolated install with a fresh SQLite file per test.
func newTestAPI(t *testing.T) (*API, http.Handler) {
	t.Helper()
	return newTestAPIWithFaviconDomains(t, "*")
}

func newTestAPIWithFaviconDomains(t *testing.T, faviconAllowedDomains string) (*API, http.Handler) {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	svc := service.New(st)
	if _, err := svc.UpdateFetchSettings(service.UpdateFetchSettingsInput{FaviconAllowedDomains: &faviconAllowedDomains}); err != nil {
		t.Fatalf("set favicon allowed domains: %v", err)
	}
	mockFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><html><body>ok</body></html>")},
	}
	api := NewAPI(svc, mockFS)
	return api, NewRouter(api)
}

type reqOpts struct {
	cookie    *http.Cookie
	token     string
	origin    string
	fetchSite string
	body      any
}

func do(t *testing.T, h http.Handler, method, path string, o reqOpts) *httptest.ResponseRecorder {
	t.Helper()
	var body io.Reader
	if o.body != nil {
		raw, err := json.Marshal(o.body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		body = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, body)
	if o.body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if o.cookie != nil {
		req.AddCookie(o.cookie)
	}
	if o.token != "" {
		req.Header.Set("Authorization", "Bearer "+o.token)
	}
	if o.origin != "" {
		req.Header.Set("Origin", o.origin)
	}
	if o.fetchSite != "" {
		req.Header.Set("Sec-Fetch-Site", o.fetchSite)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func sessionCookie(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == sessionCookieName {
			return &http.Cookie{Name: c.Name, Value: c.Value}
		}
	}
	t.Fatalf("no session cookie in response")
	return nil
}

func TestSessionCookieSecureFollowsRequest(t *testing.T) {
	cases := []struct {
		name       string
		forwarded  string
		tls        bool
		wantSecure bool
	}{
		{name: "http"},
		{name: "https via proxy", forwarded: "https", wantSecure: true},
		{name: "proxy chain", forwarded: "https,http", wantSecure: true},
		{name: "http via proxy", forwarded: "http"},
		{name: "direct https", tls: true, wantSecure: true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			api, h := newTestAPI(t)
			if err := api.Service.InitAdmin("admin", "nextnav123", false); err != nil {
				t.Fatalf("init admin: %v", err)
			}
			req := httptest.NewRequest("POST", "/api/login",
				bytes.NewBufferString(`{"username":"admin","password":"nextnav123"}`))
			req.Header.Set("Content-Type", "application/json")
			if c.forwarded != "" {
				req.Header.Set("X-Forwarded-Proto", c.forwarded)
			}
			if c.tls {
				req.TLS = &tls.ConnectionState{}
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("login: %d %s", rec.Code, rec.Body)
			}
			found := false
			for _, cookie := range rec.Result().Cookies() {
				if cookie.Name == sessionCookieName {
					found = true
					if cookie.Secure != c.wantSecure {
						t.Fatalf("Secure = %v, want %v", cookie.Secure, c.wantSecure)
					}
				}
			}
			if !found {
				t.Fatal("no session cookie in response")
			}
		})
	}
}

func TestSessionCookieTTLFollowsSecuritySettings(t *testing.T) {
	api, h := newTestAPI(t)
	if err := api.Service.InitAdmin("admin", "nextnav123", false); err != nil {
		t.Fatalf("init admin: %v", err)
	}
	if _, err := api.Service.UpdateSecuritySettings(24); err != nil {
		t.Fatalf("update session TTL: %v", err)
	}

	before := time.Now().UnixMilli()
	rec := do(t, h, "POST", "/api/login", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("login: %d %s", rec.Code, rec.Body)
	}

	var cookie *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == sessionCookieName {
			cookie = c
			break
		}
	}
	if cookie == nil {
		t.Fatal("no session cookie in response")
	}
	if cookie.MaxAge != 24*60*60 {
		t.Errorf("MaxAge = %d，期望 %d", cookie.MaxAge, 24*60*60)
	}
	body := decode[struct {
		ExpiresAt int64 `json:"expiresAt"`
	}](t, rec)
	if body.ExpiresAt < before+24*time.Hour.Milliseconds()-1000 || body.ExpiresAt > time.Now().Add(24*time.Hour).UnixMilli() {
		t.Errorf("会话到期时间 %d 不在 24h 范围内", body.ExpiresAt)
	}
}

func setupAdmin(t *testing.T, api *API, seedSample bool) *http.Cookie {
	t.Helper()
	if err := api.Service.InitAdmin("admin", "nextnav123", seedSample); err != nil {
		t.Fatalf("init admin: %v", err)
	}
	h := NewRouter(api)
	rec := do(t, h, "POST", "/api/login", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("login: got %d, body %s", rec.Code, rec.Body)
	}
	return sessionCookie(t, rec)
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return v
}

// --- tests ---

func TestInitAdminIsOneShot(t *testing.T) {
	api, _ := newTestAPI(t)

	err := api.Service.InitAdmin("admin", "nextnav123", false)
	if err != nil {
		t.Fatalf("init admin: %v", err)
	}

	err = api.Service.InitAdmin("other", "another123", false)
	if err != nil {
		t.Fatalf("second init admin: %v", err)
	}

	user, ok := api.Service.Authenticate("admin", "nextnav123")
	if !ok || user != "admin" {
		t.Fatalf("original admin credentials should remain valid")
	}
	_, ok = api.Service.Authenticate("other", "another123")
	if ok {
		t.Fatalf("second credentials should not have taken effect")
	}
}

func TestInitAdminDefaultWithoutSeedSample(t *testing.T) {
	api, h := newTestAPI(t)

	if err := api.Service.InitAdmin("admin", "nextnav123", false); err != nil {
		t.Fatalf("init admin: %v", err)
	}

	rec := do(t, h, "GET", "/api/home", reqOpts{})
	if rec.Code != http.StatusOK {
		t.Fatalf("home: %d", rec.Code)
	}

	type homeResp struct {
		Groups []any `json:"groups"`
	}
	var res homeResp
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("parse home response: %v", err)
	}
	if len(res.Groups) != 0 {
		t.Fatalf("expected empty groups without seedSample, got %d", len(res.Groups))
	}
}

func TestInitAdminRejectsShortPassword(t *testing.T) {
	api, _ := newTestAPI(t)
	err := api.Service.InitAdmin("admin", "short", false)
	if err == nil {
		t.Fatalf("expected error for short password, got nil")
	}
}

func TestPasswordChangeRevokesOtherSessions(t *testing.T) {
	api, h := newTestAPI(t)
	firstCookie := setupAdmin(t, api, false)

	rec := do(t, h, "POST", "/api/login", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("second login: %d %s", rec.Code, rec.Body)
	}
	secondCookie := sessionCookie(t, rec)

	rec = do(t, h, "POST", "/api/settings/account", reqOpts{
		cookie:    firstCookie,
		origin:    "http://example.com",
		fetchSite: "same-origin",
		body: map[string]string{
			"currentPassword": "nextnav123",
			"newPassword":     "changedpass123",
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("change password: %d %s", rec.Code, rec.Body)
	}
	currentCookie := sessionCookie(t, rec)

	for _, oldCookie := range []*http.Cookie{firstCookie, secondCookie} {
		rec = do(t, h, "GET", "/api/me", reqOpts{cookie: oldCookie})
		if rec.Code != http.StatusOK {
			t.Fatalf("old session me: %d %s", rec.Code, rec.Body)
		}
		if got := decode[map[string]any](t, rec)["auth"]; got != "guest" {
			t.Fatalf("expected old session to be revoked, got %v", got)
		}
	}

	rec = do(t, h, "GET", "/api/me", reqOpts{cookie: currentCookie})
	if got := decode[map[string]any](t, rec)["auth"]; got != "admin" {
		t.Fatalf("expected current session to remain valid, got %v", got)
	}

	rec = do(t, h, "POST", "/api/login", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("old password login: %d %s", rec.Code, rec.Body)
	}
	rec = do(t, h, "POST", "/api/login", reqOpts{
		body: map[string]string{"username": "admin", "password": "changedpass123"},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("new password login: %d %s", rec.Code, rec.Body)
	}

	rec = do(t, h, "POST", "/api/settings/account", reqOpts{
		cookie:    currentCookie,
		origin:    "http://example.com",
		fetchSite: "same-origin",
		body: map[string]string{
			"currentPassword": "changedpass123",
			"username":        "newname",
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("change username: %d %s", rec.Code, rec.Body)
	}
	rec = do(t, h, "GET", "/api/me", reqOpts{cookie: currentCookie})
	me := decode[map[string]any](t, rec)
	if me["auth"] != "admin" || me["username"] != "newname" {
		t.Fatalf("username-only change should keep session valid, got %v", me)
	}
}

func TestSeedDataIsPublicAndComplete(t *testing.T) {
	api, h := newTestAPI(t)
	if err := api.Service.InitAdmin("admin", "nextnav123", true); err != nil {
		t.Fatalf("init admin: %v", err)
	}

	rec := do(t, h, "GET", "/api/home", reqOpts{})
	if rec.Code != http.StatusOK {
		t.Fatalf("home: %d", rec.Code)
	}

	var home struct {
		Groups []struct {
			Name       string `json:"name"`
			Links      []any  `json:"links"`
			Categories []struct {
				Links []any `json:"links"`
			} `json:"categories"`
		} `json:"groups"`
	}
	home = decode[struct {
		Groups []struct {
			Name       string `json:"name"`
			Links      []any  `json:"links"`
			Categories []struct {
				Links []any `json:"links"`
			} `json:"categories"`
		} `json:"groups"`
	}](t, rec)

	if len(home.Groups) != 5 {
		t.Fatalf("groups: got %d, want 5", len(home.Groups))
	}
	var links, cats int
	for _, g := range home.Groups {
		links += len(g.Links)
		cats += len(g.Categories)
		for _, c := range g.Categories {
			links += len(c.Links)
		}
	}
	if cats != 11 || links != 49 {
		t.Fatalf("seed: got %d categories / %d links, want 11 / 49", cats, links)
	}
}

func TestGuestCannotWrite(t *testing.T) {
	api, h := newTestAPI(t)
	if err := api.Service.InitAdmin("admin", "nextnav123", true); err != nil {
		t.Fatalf("init admin: %v", err)
	}

	rec := do(t, h, "POST", "/api/links", reqOpts{
		body: map[string]any{"categoryId": 2, "title": "X", "url": "https://example.com"},
	})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("guest write: got %d, want 401", rec.Code)
	}
}

func TestPrivateContentHiddenFromGuests(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	// Mark the whole "开发" group private (id 3 from seeding order).
	rec := do(t, h, "PATCH", "/api/categories/3", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{"isPrivate": true},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("patch category: %d %s", rec.Code, rec.Body)
	}

	type homeShape struct {
		Groups []struct {
			Name       string `json:"name"`
			Links      []any  `json:"links"`
			Categories []struct {
				Links []any `json:"links"`
			} `json:"categories"`
		} `json:"groups"`
	}

	adminHome := decode[homeShape](t, do(t, h, "GET", "/api/home", reqOpts{cookie: cookie}))
	guestHome := decode[homeShape](t, do(t, h, "GET", "/api/home", reqOpts{}))

	count := func(hs homeShape) int {
		var n int
		for _, g := range hs.Groups {
			n += len(g.Links)
			for _, c := range g.Categories {
				n += len(c.Links)
			}
		}
		return n
	}

	if count(adminHome) != 49 {
		t.Fatalf("admin sees %d links, want 49", count(adminHome))
	}
	if count(guestHome) != 49-15 {
		t.Fatalf("guest sees %d links, want %d", count(guestHome), 49-15)
	}
	for _, g := range guestHome.Groups {
		if g.Name == "开发" {
			t.Fatalf("private group still visible to guests")
		}
	}
	_ = api
}

func TestPrivateLinkHidesOnlyItself(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	// Link 1 is Google inside 搜索引擎 (category 2).
	rec := do(t, h, "PATCH", "/api/links/1", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{"isPrivate": true},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("patch link: %d %s", rec.Code, rec.Body)
	}

	type homeShape struct {
		Groups []struct {
			Links      []any `json:"links"`
			Categories []struct {
				Links []any `json:"links"`
			} `json:"categories"`
		} `json:"groups"`
	}
	guestHome := decode[homeShape](t, do(t, h, "GET", "/api/home", reqOpts{}))
	var n int
	for _, g := range guestHome.Groups {
		n += len(g.Links)
		for _, c := range g.Categories {
			n += len(c.Links)
		}
	}
	if n != 48 {
		t.Fatalf("guest sees %d links, want 48", n)
	}
}

func TestCSRFOnlyAppliesToCookieWrites(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, false)

	t.Run("cross-site cookie write rejected", func(t *testing.T) {
		rec := do(t, h, "POST", "/api/categories", reqOpts{
			cookie: cookie, fetchSite: "cross-site",
			body: map[string]any{"name": "blocked"},
		})
		if rec.Code != http.StatusForbidden {
			t.Fatalf("got %d, want 403", rec.Code)
		}
	})

	t.Run("same-origin cookie write allowed", func(t *testing.T) {
		rec := do(t, h, "POST", "/api/categories", reqOpts{
			cookie: cookie, fetchSite: "same-origin",
			body: map[string]any{"name": "allowed"},
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("got %d, want 201", rec.Code)
		}
	})

	t.Run("cookie read without origin allowed", func(t *testing.T) {
		rec := do(t, h, "GET", "/api/home", reqOpts{cookie: cookie})
		if rec.Code != http.StatusOK {
			t.Fatalf("got %d, want 200", rec.Code)
		}
	})
}

func TestDuplicateLinkScopedToCategory(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	body := map[string]any{"categoryId": 2, "title": "重复站", "url": "https://dup.example.com"}
	rec := do(t, h, "POST", "/api/links", reqOpts{cookie: cookie, fetchSite: "same-origin", body: body})
	if rec.Code != http.StatusCreated {
		t.Fatalf("first create: %d %s", rec.Code, rec.Body)
	}
	rec = do(t, h, "POST", "/api/links", reqOpts{cookie: cookie, fetchSite: "same-origin", body: body})
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate: %d, want 409", rec.Code)
	}

	// Same URL in a different category is allowed.
	other := map[string]any{"categoryId": 4, "title": "重复站", "url": "https://dup.example.com"}
	rec = do(t, h, "POST", "/api/links", reqOpts{cookie: cookie, fetchSite: "same-origin", body: other})
	if rec.Code != http.StatusCreated {
		t.Fatalf("other category: %d, want 201", rec.Code)
	}

	// Updating an existing link's URL to an existing URL in the same category is rejected.
	patchDup := map[string]any{"url": "https://dup.example.com"}
	rec = do(t, h, "PATCH", "/api/links/1", reqOpts{cookie: cookie, fetchSite: "same-origin", body: patchDup})
	if rec.Code != http.StatusConflict {
		t.Fatalf("patch duplicate URL: expected 409, got %d %s", rec.Code, rec.Body)
	}
}

func TestDeleteCategoryRequiresDisposition(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	rec := do(t, h, "DELETE", "/api/categories/2", reqOpts{cookie: cookie, fetchSite: "same-origin"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("no disposition: %d, want 409", rec.Code)
	}

	rec = do(t, h, "DELETE", "/api/categories/2?links=move&moveToCategoryId=4",
		reqOpts{cookie: cookie, fetchSite: "same-origin"})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("move disposition: %d, want 204", rec.Code)
	}
}

func TestSPAFallback(t *testing.T) {
	_, h := newTestAPI(t)

	rec := do(t, h, "GET", "/", reqOpts{})
	if rec.Code != http.StatusOK {
		t.Fatalf("index: %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct[:9] != "text/html" {
		t.Fatalf("index content type: %s", ct)
	}

	rec = do(t, h, "GET", "/settings", reqOpts{})
	if rec.Code != http.StatusOK {
		t.Fatalf("client route: %d", rec.Code)
	}

	rec = do(t, h, "GET", "/api/does-not-exist", reqOpts{})
	if rec.Code != http.StatusNotFound && rec.Code != http.StatusOK {
		t.Fatalf("unknown api path: %d", rec.Code)
	}
}

func TestIconPathTraversalBlocked(t *testing.T) {
	api, h := newTestAPI(t)

	// Write a file outside the icons dir that must never be served.
	secret := filepath.Join(api.Service.DataDir(), "secret.txt")
	if err := os.WriteFile(secret, []byte("top secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	for _, p := range []string{"/icons/../secret.txt", "/icons/%2e%2e/secret.txt", "/icons/"} {
		rec := do(t, h, "GET", p, reqOpts{})
		if rec.Code == http.StatusOK {
			t.Fatalf("%s was served: %d", p, rec.Code)
		}
	}

	// A real icon file is served.
	iconDir := filepath.Join(api.Service.DataDir(), "icons", "ab", "cd")
	if err := os.MkdirAll(iconDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(iconDir, "x.png"), []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	rec := do(t, h, "GET", "/icons/ab/cd/x.png", reqOpts{})
	if rec.Code != http.StatusOK {
		t.Fatalf("icon: %d", rec.Code)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Fatalf("cache-control: %s", cc)
	}
}

// Ensure the request context carries the identity for handlers.
func TestIdentityInContext(t *testing.T) {
	api, _ := newTestAPI(t)
	var got httpx.Identity
	h := api.Auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = httpx.IdentityFrom(r.Context())
	}))
	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if got.Method != httpx.AuthNone || got.Admin {
		t.Fatalf("anonymous identity: %+v", got)
	}
	_ = context.Background()
}

func TestCategoryFieldsCRUD(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, false)

	// Create root group with icon, sort, description
	rec := do(t, h, "POST", "/api/categories", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{
			"name":        "AI 工具",
			"icon":        "Sparkles",
			"sort":        500,
			"description": "常用人工智能与大模型工具",
			"isPrivate":   false,
		},
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create category: %d %s", rec.Code, rec.Body)
	}
	var created struct {
		ID int64 `json:"id"`
	}
	created = decode[struct {
		ID int64 `json:"id"`
	}](t, rec)

	// Update category fields
	rec = do(t, h, "PATCH", fmt.Sprintf("/api/categories/%d", created.ID), reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{
			"name":        "人工智能与模型",
			"icon":        "🤖",
			"sort":        300,
			"description": "更新后的大模型工具描述",
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("patch category: %d %s", rec.Code, rec.Body)
	}

	// Verify in /api/home
	type homeWithCatMeta struct {
		Groups []struct {
			ID          int64   `json:"id"`
			Name        string  `json:"name"`
			IconURL     *string `json:"iconUrl"`
			Description *string `json:"description"`
			Sort        int64   `json:"sort"`
		} `json:"groups"`
	}
	home := decode[homeWithCatMeta](t, do(t, h, "GET", "/api/home", reqOpts{cookie: cookie}))
	var found bool
	for _, g := range home.Groups {
		if g.ID == created.ID {
			found = true
			if g.Name != "人工智能与模型" {
				t.Errorf("name = %q, want 人工智能与模型", g.Name)
			}
			if g.IconURL == nil || *g.IconURL != "🤖" {
				t.Errorf("icon = %v, want 🤖", g.IconURL)
			}
			if g.Sort != 300 {
				t.Errorf("sort = %d, want 300", g.Sort)
			}
			if g.Description == nil || *g.Description != "更新后的大模型工具描述" {
				t.Errorf("desc = %v, want 更新后的大模型工具描述", g.Description)
			}
		}
	}
	if !found {
		t.Fatalf("created category %d not found in /api/home", created.ID)
	}
}

func TestLinkSortCRUD(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, false)

	// Create root group first
	rec := do(t, h, "POST", "/api/categories", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{"name": "分类1"},
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create category: %d %s", rec.Code, rec.Body)
	}
	cat := decode[struct {
		ID int64 `json:"id"`
	}](t, rec)

	// Create link with custom sort 50
	rec = do(t, h, "POST", "/api/links", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{
			"categoryId": cat.ID,
			"title":      "测试链接1",
			"url":        "https://example1.com",
			"sort":       50,
		},
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create link: %d %s", rec.Code, rec.Body)
	}
	link := decode[struct {
		ID   int64 `json:"id"`
		Sort int64 `json:"sort"`
	}](t, rec)
	if link.Sort != 50 {
		t.Fatalf("link sort = %d, want 50", link.Sort)
	}

	// Update link sort to 200
	rec = do(t, h, "PATCH", fmt.Sprintf("/api/links/%d", link.ID), reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{
			"sort": 200,
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("patch link: %d %s", rec.Code, rec.Body)
	}
	updated := decode[struct {
		ID   int64 `json:"id"`
		Sort int64 `json:"sort"`
	}](t, rec)
	if updated.Sort != 200 {
		t.Fatalf("updated link sort = %d, want 200", updated.Sort)
	}
}

func TestCSRFWithForwardedHost(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, false)

	req := httptest.NewRequest("POST", "/api/categories", bytes.NewReader([]byte(`{"name":"代理分类"}`)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://nav.mydomain.com")
	req.Header.Set("X-Forwarded-Host", "nav.mydomain.com")
	req.AddCookie(cookie)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 when X-Forwarded-Host matches Origin, got %d: %s", rec.Code, rec.Body)
	}
}

func TestClientIPSecurity(t *testing.T) {
	// 1. 公网直连客户端伪造 XFF 应当被忽略
	pubReq := httptest.NewRequest("GET", "/api/health", nil)
	pubReq.RemoteAddr = "203.0.113.195:4321"
	pubReq.Header.Set("X-Forwarded-For", "1.1.1.1, 8.8.8.8")
	if ip := clientIP(pubReq); ip != "203.0.113.195" {
		t.Fatalf("public client IP should ignore forged XFF, got %q", ip)
	}

	// 2. 本地/内网反代转发时应信任 XFF
	proxyReq := httptest.NewRequest("GET", "/api/health", nil)
	proxyReq.RemoteAddr = "127.0.0.1:54321"
	proxyReq.Header.Set("X-Forwarded-For", "198.51.100.22, 10.0.0.1")
	if ip := clientIP(proxyReq); ip != "198.51.100.22" {
		t.Fatalf("proxied client IP should resolve first XFF, got %q", ip)
	}
}

func TestBatchOperations(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, false)

	// Create Category A & B
	rec := do(t, h, "POST", "/api/categories", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{"name": "分类A"},
	})
	catA := decode[struct{ ID int64 }](t, rec)

	rec = do(t, h, "POST", "/api/categories", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{"name": "分类B"},
	})
	catB := decode[struct{ ID int64 }](t, rec)

	// Create 3 links in CatA
	var linkIDs []int64
	for i := 1; i <= 3; i++ {
		rec = do(t, h, "POST", "/api/links", reqOpts{
			cookie: cookie, origin: "http://example.com",
			body: map[string]any{
				"categoryId": catA.ID,
				"title":      fmt.Sprintf("Link %d", i),
				"url":        fmt.Sprintf("https://test%d.com", i),
			},
		})
		l := decode[struct{ ID int64 }](t, rec)
		linkIDs = append(linkIDs, l.ID)
	}

	// Batch move 2 links to CatB
	rec = do(t, h, "POST", "/api/links/batch-move", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{
			"ids":        linkIDs[:2],
			"categoryId": catB.ID,
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("batch move failed: %d %s", rec.Code, rec.Body)
	}
	moveRes := decode[struct{ MovedCount int64 }](t, rec)
	if moveRes.MovedCount != 2 {
		t.Fatalf("moved count = %d, want 2", moveRes.MovedCount)
	}

	// Batch delete
	rec = do(t, h, "POST", "/api/links/batch-delete", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: map[string]any{
			"ids": []int64{linkIDs[2]},
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("batch delete failed: %d %s", rec.Code, rec.Body)
	}
	delRes := decode[struct{ DeletedCount int64 }](t, rec)
	if delRes.DeletedCount != 1 {
		t.Fatalf("deleted count = %d, want 1", delRes.DeletedCount)
	}
}

func TestTokensAndBearerAuth(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, false)

	// Initially no token
	rec := do(t, h, "GET", "/api/tokens", reqOpts{cookie: cookie})
	if rec.Code != http.StatusOK {
		t.Fatalf("get tokens: %d %s", rec.Code, rec.Body)
	}

	// Generate token
	rec = do(t, h, "POST", "/api/tokens", reqOpts{cookie: cookie, origin: "http://example.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("create token: %d %s", rec.Code, rec.Body)
	}
	tokRes := decode[struct {
		Token string `json:"token"`
	}](t, rec)
	if tokRes.Token == "" {
		t.Fatalf("expected non-empty token")
	}

	// Access with Bearer token (no cookie, no origin needed)
	rec = do(t, h, "POST", "/api/categories", reqOpts{
		token: tokRes.Token,
		body:  map[string]any{"name": "Token分类"},
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create category with token failed: %d %s", rec.Code, rec.Body)
	}

	// Revoke token
	rec = do(t, h, "DELETE", "/api/tokens", reqOpts{cookie: cookie, origin: "http://example.com"})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete token: %d %s", rec.Code, rec.Body)
	}

	// Old token rejected
	rec = do(t, h, "POST", "/api/categories", reqOpts{
		token: tokRes.Token,
		body:  map[string]any{"name": "Reject"},
	})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 after token revocation, got %d", rec.Code)
	}
}

func TestBackupExportImport(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	// Export
	rec := do(t, h, "GET", "/api/backup/export", reqOpts{cookie: cookie})
	if rec.Code != http.StatusOK {
		t.Fatalf("backup export: %d %s", rec.Code, rec.Body)
	}
	var backupData store.BackupData
	if err := json.Unmarshal(rec.Body.Bytes(), &backupData); err != nil {
		t.Fatalf("unmarshal backup: %v", err)
	}
	if len(backupData.Categories) == 0 || len(backupData.Links) == 0 {
		t.Fatalf("expected non-empty backup from seeded sample, got %d cats, %d links",
			len(backupData.Categories), len(backupData.Links))
	}

	// Import overwrite
	rec = do(t, h, "POST", "/api/backup/import?mode=overwrite", reqOpts{
		cookie: cookie, origin: "http://example.com",
		body: backupData,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("import overwrite failed: %d %s", rec.Code, rec.Body)
	}
}

func TestHealthCheckAPI(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	// 1. Get check status initially
	rec := do(t, h, "GET", "/api/check/status", reqOpts{cookie: cookie})
	if rec.Code != http.StatusOK {
		t.Fatalf("get check status: %d %s", rec.Code, rec.Body)
	}

	// 2. Trigger check all
	rec = do(t, h, "POST", "/api/links/check-all", reqOpts{cookie: cookie, origin: "http://example.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("check-all: %d %s", rec.Code, rec.Body)
	}
	var checkAllResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &checkAllResp); err != nil {
		t.Fatalf("unmarshal check-all: %v", err)
	}
	if checkAllResp["started"] != true {
		t.Fatalf("expected started true, got %v", checkAllResp)
	}

	// 3. Single link check
	catID, err := api.Service.Store().CreateCategory(&store.Category{Name: "Dev", Sort: 10})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}
	linkID, err := api.Service.Store().CreateLink(&store.Link{
		CategoryID: catID,
		Title:      "Local Server",
		URL:        "https://example.com",
		Sort:       10,
		TitleNorm:  "local server",
		Host:       "example.com",
		SearchText: "local server",
	})
	if err != nil {
		t.Fatalf("create link: %v", err)
	}

	rec = do(t, h, "POST", fmt.Sprintf("/api/links/%d/check", linkID), reqOpts{cookie: cookie, origin: "http://example.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("single link check: %d %s", rec.Code, rec.Body)
	}

	// 4. Query checks list
	rec = do(t, h, "GET", "/api/checks?status=all&page=1&pageSize=10", reqOpts{cookie: cookie})
	if rec.Code != http.StatusOK {
		t.Fatalf("list checks: %d %s", rec.Code, rec.Body)
	}
	var listResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("unmarshal list checks: %v", err)
	}
	if listResp["items"] == nil {
		t.Fatalf("expected items array in checks list")
	}
}

func TestFetchMetaAPIRejectsPrivateAddress(t *testing.T) {
	var hits atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!DOCTYPE html><html><head><title>Meta API Title</title><meta name="description" content="Meta API Desc"/></head><body></body></html>`))
	}))
	defer ts.Close()

	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	// 1. Guest request rejected
	rec := do(t, h, "POST", "/api/meta", reqOpts{body: map[string]string{"url": ts.URL}})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for guest, got %d", rec.Code)
	}

	// 2. Admin request success
	rec = do(t, h, "POST", "/api/meta", reqOpts{
		cookie:    cookie,
		origin:    "http://example.com",
		fetchSite: "same-origin",
		body:      map[string]string{"url": ts.URL},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", rec.Code, rec.Body)
	}

	var metaResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &metaResp); err != nil {
		t.Fatalf("unmarshal meta resp: %v", err)
	}
	if metaResp["title"] != "" || metaResp["description"] != "" {
		t.Errorf("expected empty metadata for blocked target, got %v", metaResp)
	}
	if got := hits.Load(); got != 0 {
		t.Fatalf("expected no requests to private target, got %d", got)
	}
}

func TestUploadAndRemoveLogoAPI(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	pngBytes := []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
		0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
		0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
		0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
		0x42, 0x60, 0x82,
	}

	// 1. Upload valid PNG logo
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "logo.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(pngBytes); err != nil {
		t.Fatal(err)
	}
	_ = writer.Close()

	req := httptest.NewRequest("POST", "/api/settings/logo", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Origin", "http://example.com")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.AddCookie(cookie)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for upload logo, got %d %s", rec.Code, rec.Body)
	}

	var uploadResp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &uploadResp); err != nil {
		t.Fatalf("unmarshal upload resp: %v", err)
	}
	if uploadResp["logoUrl"] == "" {
		t.Fatalf("expected non-empty logoUrl")
	}

	// Verify public settings reflects logo
	recHome := do(t, h, "GET", "/api/home", reqOpts{})
	var homeResp map[string]any
	_ = json.Unmarshal(recHome.Body.Bytes(), &homeResp)
	site := homeResp["site"].(map[string]any)
	if site["logoUrl"] != uploadResp["logoUrl"] {
		t.Fatalf("expected logoUrl %v, got %v", uploadResp["logoUrl"], site["logoUrl"])
	}

	// 2. Remove Logo
	recDel := do(t, h, "DELETE", "/api/settings/logo", reqOpts{
		cookie:    cookie,
		origin:    "http://example.com",
		fetchSite: "same-origin",
	})
	if recDel.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for delete logo, got %d %s", recDel.Code, recDel.Body)
	}

	recHomeAfter := do(t, h, "GET", "/api/home", reqOpts{})
	var homeRespAfter map[string]any
	_ = json.Unmarshal(recHomeAfter.Body.Bytes(), &homeRespAfter)
	siteAfter := homeRespAfter["site"].(map[string]any)
	if siteAfter["logoUrl"] != nil {
		t.Fatalf("expected nil logoUrl, got %v", siteAfter["logoUrl"])
	}
}

var dummyPNG = []byte{
	0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
	0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
	0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
	0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
	0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
	0x42, 0x60, 0x82,
}

// uploadIcon posts a PNG as the icon of the given link.
func uploadIcon(t *testing.T, h http.Handler, cookie *http.Cookie, linkID int) *httptest.ResponseRecorder {
	t.Helper()
	pngBytes := dummyPNG
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "icon.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(pngBytes); err != nil {
		t.Fatal(err)
	}
	_ = writer.Close()

	req := httptest.NewRequest("POST", fmt.Sprintf("/api/links/%d/icon", linkID), body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Origin", "http://example.com")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.AddCookie(cookie)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestUploadLinkIconAndClear(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	rec := uploadIcon(t, h, cookie, 1)
	if rec.Code != http.StatusOK {
		t.Fatalf("upload icon: got %d %s", rec.Code, rec.Body)
	}
	d := decode[service.LinkDTO](t, rec)
	if d.IconURL == nil || !strings.HasPrefix(*d.IconURL, "/icons/") {
		t.Fatalf("expected icon url, got %v", d.IconURL)
	}
	iconURL := *d.IconURL

	// The icon must be served and visible in the home payload.
	if recIcon := do(t, h, "GET", iconURL, reqOpts{}); recIcon.Code != http.StatusOK {
		t.Fatalf("serve icon: got %d", recIcon.Code)
	}
	home := decode[map[string]any](t, do(t, h, "GET", "/api/home", reqOpts{cookie: cookie}))
	groups := home["groups"].([]any)
	firstLink := groups[0].(map[string]any)["categories"].([]any)[0].(map[string]any)["links"].([]any)[0].(map[string]any)
	if firstLink["iconUrl"] != iconURL {
		t.Fatalf("home iconUrl = %v, want %v", firstLink["iconUrl"], iconURL)
	}

	// Clearing removes the reference and the now-unreferenced file.
	recClear := do(t, h, "DELETE", "/api/links/1/icon", reqOpts{
		cookie: cookie, origin: "http://example.com", fetchSite: "same-origin",
	})
	if recClear.Code != http.StatusOK {
		t.Fatalf("clear icon: got %d %s", recClear.Code, recClear.Body)
	}
	if d = decode[service.LinkDTO](t, recClear); d.IconURL != nil {
		t.Fatalf("expected nil iconUrl after clear, got %v", d.IconURL)
	}
	if recIcon := do(t, h, "GET", iconURL, reqOpts{}); recIcon.Code != http.StatusNotFound {
		t.Fatalf("expected icon file deleted, got %d", recIcon.Code)
	}
}

func TestUploadLinkIconRejectsBadInput(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	if rec := uploadIcon(t, h, cookie, 9999); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown link: got %d %s", rec.Code, rec.Body)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "evil.svg")
	_, _ = part.Write([]byte("<svg onload='alert(1)'></svg>"))
	_ = writer.Close()
	req := httptest.NewRequest("POST", "/api/links/1/icon", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Origin", "http://example.com")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.AddCookie(cookie)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for svg, got %d %s", rec.Code, rec.Body)
	}
}

func TestLinkIconPathMustExistInStore(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	// A path that was never stored must not be accepted.
	rec := do(t, h, "PATCH", "/api/links/1", reqOpts{
		cookie: cookie, origin: "http://example.com", fetchSite: "same-origin",
		body: map[string]any{"iconPath": "icons/ab/cd/not-real.png"},
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing icon, got %d %s", rec.Code, rec.Body)
	}

	// Traversal is rejected too.
	rec = do(t, h, "PATCH", "/api/links/1", reqOpts{
		cookie: cookie, origin: "http://example.com", fetchSite: "same-origin",
		body: map[string]any{"iconPath": "icons/../../etc/passwd"},
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for traversal, got %d %s", rec.Code, rec.Body)
	}
}

func TestDeleteLinkPurgesUnreferencedIcon(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	d := decode[service.LinkDTO](t, uploadIcon(t, h, cookie, 1))
	iconURL := *d.IconURL

	// Two links sharing the same icon file: deleting one must keep the file.
	recDup := do(t, h, "POST", "/api/links", reqOpts{
		cookie: cookie, origin: "http://example.com", fetchSite: "same-origin",
		body: map[string]any{
			"categoryId": 2, "title": "Google Mirror", "url": "https://google.example.com",
			"iconPath": strings.TrimPrefix(iconURL, "/"),
		},
	})
	if recDup.Code != http.StatusCreated {
		t.Fatalf("create duplicate-icon link: got %d %s", recDup.Code, recDup.Body)
	}

	if rec := do(t, h, "DELETE", "/api/links/1", reqOpts{
		cookie: cookie, origin: "http://example.com", fetchSite: "same-origin",
	}); rec.Code != http.StatusNoContent {
		t.Fatalf("delete link: got %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, "GET", iconURL, reqOpts{}); rec.Code != http.StatusOK {
		t.Fatalf("shared icon should survive, got %d", rec.Code)
	}

	mirrorID := int(decode[service.LinkDTO](t, recDup).ID)
	if rec := do(t, h, "DELETE", fmt.Sprintf("/api/links/%d", mirrorID), reqOpts{
		cookie: cookie, origin: "http://example.com", fetchSite: "same-origin",
	}); rec.Code != http.StatusNoContent {
		t.Fatalf("delete mirror: got %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, "GET", iconURL, reqOpts{}); rec.Code != http.StatusNotFound {
		t.Fatalf("last reference deleted should purge file, got %d", rec.Code)
	}
}

func TestPurgeOrphanIconsAPI(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	d := decode[service.LinkDTO](t, uploadIcon(t, h, cookie, 1))
	iconURL := *d.IconURL

	// Drop the reference behind the API's back to simulate a stale file.
	if _, err := api.Service.Store().DB.Exec(`UPDATE link SET icon_path = NULL, icon_source = NULL WHERE id = 1`); err != nil {
		t.Fatalf("clear icon ref: %v", err)
	}

	rec := do(t, h, "POST", "/api/icons/purge", reqOpts{
		cookie: cookie, origin: "http://example.com", fetchSite: "same-origin",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("purge: got %d %s", rec.Code, rec.Body)
	}
	if got := decode[map[string]int](t, rec)["removed"]; got != 1 {
		t.Fatalf("expected 1 removed file, got %d", got)
	}
	if rec := do(t, h, "GET", iconURL, reqOpts{}); rec.Code != http.StatusNotFound {
		t.Fatalf("orphan icon should be gone, got %d", rec.Code)
	}
}

func TestServeFaviconAPI(t *testing.T) {
	api, h := newTestAPI(t)

	// 1. 无效域名返回 400
	rec := do(t, h, "GET", "/api/favicon/", reqOpts{})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty domain, got %d", rec.Code)
	}

	// 2. 有效路径请求并命中预设缓存
	relPath, err := api.Service.SaveIconContent(dummyPNG, "baidu.png")
	if err != nil {
		t.Fatalf("save icon content: %v", err)
	}
	if err := api.Service.Store().SetFaviconCache("www.baidu.com", relPath); err != nil {
		t.Fatalf("set favicon cache: %v", err)
	}

	// 请求 /api/favicon/www.baidu.com.png
	rec = do(t, h, "GET", "/api/favicon/www.baidu.com.png", reqOpts{})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for cached favicon, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("expected image/png content type, got %s", ct)
	}

	// 请求 /api/favicon/www.baidu.com.ico（同一个缓存）
	rec = do(t, h, "GET", "/api/favicon/www.baidu.com.ico", reqOpts{})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for cached favicon, got %d", rec.Code)
	}
}

func TestCreateLinkWithCustomIconURLAPI(t *testing.T) {
	api, h := newTestAPI(t)
	cookie := setupAdmin(t, api, true)

	// 创建带独立图标链接 (iconUrl) 的链接
	customURL := "https://img.example.com/logo.webp"
	rec := do(t, h, "POST", "/api/links", reqOpts{
		cookie:    cookie,
		origin:    "http://example.com",
		fetchSite: "same-origin",
		body: map[string]any{
			"categoryId": 1,
			"title":      "测试外链图标",
			"url":        "https://example.com/custom-icon",
			"iconUrl":    customURL,
		},
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 created, got %d: %s", rec.Code, rec.Body)
	}
	d := decode[service.LinkDTO](t, rec)
	if d.IconURL == nil || *d.IconURL != customURL {
		t.Errorf("expected iconUrl %q, got %#v", customURL, d.IconURL)
	}
	if d.CustomIconURL == nil || *d.CustomIconURL != customURL {
		t.Errorf("expected customIconUrl %q, got %#v", customURL, d.CustomIconURL)
	}
}
