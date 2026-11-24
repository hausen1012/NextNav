package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"nextnav/internal/httpx"
	"nextnav/internal/service"
	"nextnav/internal/store"
	"nextnav/internal/webembed"
)

// newTestAPI creates an isolated install with a fresh SQLite file per test.
func newTestAPI(t *testing.T) (*API, http.Handler) {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	svc := service.New(st)
	api := NewAPI(svc, false, webembed.FS())
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

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return v
}

// --- tests ---

func TestSetupIsOneShot(t *testing.T) {
	_, h := newTestAPI(t)

	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("setup: got %d, body %s", rec.Code, rec.Body)
	}

	rec = do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "other", "password": "another123"},
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("second setup: got %d, want 409", rec.Code)
	}
}

func TestSetupRejectsShortPassword(t *testing.T) {
	_, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "short"},
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestSeedDataIsPublicAndComplete(t *testing.T) {
	_, h := newTestAPI(t)
	do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})

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
	_, h := newTestAPI(t)
	do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})

	rec := do(t, h, "POST", "/api/links", reqOpts{
		body: map[string]any{"categoryId": 2, "title": "X", "url": "https://example.com"},
	})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("guest write: got %d, want 401", rec.Code)
	}
}

func TestPrivateContentHiddenFromGuests(t *testing.T) {
	api, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	cookie := sessionCookie(t, rec)

	// Mark the whole "开发" group private (id 3 from seeding order).
	rec = do(t, h, "PATCH", "/api/categories/3", reqOpts{
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
	_, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	cookie := sessionCookie(t, rec)

	// Link 1 is Google inside 搜索引擎 (category 2).
	rec = do(t, h, "PATCH", "/api/links/1", reqOpts{
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
	_, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	cookie := sessionCookie(t, rec)

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
	_, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	cookie := sessionCookie(t, rec)

	body := map[string]any{"categoryId": 2, "title": "重复站", "url": "https://dup.example.com"}
	rec = do(t, h, "POST", "/api/links", reqOpts{cookie: cookie, fetchSite: "same-origin", body: body})
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
}

func TestEditClearsSampleFlag(t *testing.T) {
	api, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	cookie := sessionCookie(t, rec)

	rec = do(t, h, "PATCH", "/api/links/1", reqOpts{
		cookie: cookie, fetchSite: "same-origin",
		body: map[string]any{"title": "我的 Google"},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body)
	}

	var isSample int
	if err := api.Store.DB.QueryRow(`SELECT is_sample FROM link WHERE id = 1`).Scan(&isSample); err != nil {
		t.Fatal(err)
	}
	if isSample != 0 {
		t.Fatalf("is_sample still 1 after edit")
	}

	rec = do(t, h, "POST", "/api/sample/clear", reqOpts{cookie: cookie, fetchSite: "same-origin"})
	if rec.Code != http.StatusOK {
		t.Fatalf("clear: %d", rec.Code)
	}

	var n int
	if err := api.Store.DB.QueryRow(`SELECT COUNT(*) FROM link`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("after clear: %d links, want 1 (the edited one)", n)
	}

	// The surviving link must have been moved out of the deleted sample
	// category rather than cascaded away.
	var movedName string
	if err := api.Store.DB.QueryRow(
		`SELECT c.name FROM link l JOIN category c ON c.id = l.category_id WHERE l.id = 1`,
	).Scan(&movedName); err != nil {
		t.Fatal(err)
	}
	if movedName != "未分类" {
		t.Fatalf("edited link moved to %q, want 未分类", movedName)
	}
}

func TestDeleteCategoryRequiresDisposition(t *testing.T) {
	_, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	cookie := sessionCookie(t, rec)

	rec = do(t, h, "DELETE", "/api/categories/2", reqOpts{cookie: cookie, fetchSite: "same-origin"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("no disposition: %d, want 409", rec.Code)
	}

	rec = do(t, h, "DELETE", "/api/categories/2?links=move&moveToCategoryId=4",
		reqOpts{cookie: cookie, fetchSite: "same-origin"})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("move disposition: %d, want 204", rec.Code)
	}
}

func TestReorderRejectsPartialList(t *testing.T) {
	_, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	cookie := sessionCookie(t, rec)

	rec = do(t, h, "POST", "/api/links/reorder", reqOpts{
		cookie: cookie, fetchSite: "same-origin",
		body: map[string]any{"categoryId": 2, "orderedIds": []int{1}},
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("partial list: %d, want 400", rec.Code)
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
	secret := filepath.Join(api.Store.DataDir, "secret.txt")
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
	iconDir := filepath.Join(api.Store.DataDir, "icons", "ab", "cd")
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
	_, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	cookie := sessionCookie(t, rec)

	// Create root group with icon, sort, description
	rec = do(t, h, "POST", "/api/categories", reqOpts{
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
	_, h := newTestAPI(t)
	rec := do(t, h, "POST", "/api/setup", reqOpts{
		body: map[string]string{"username": "admin", "password": "nextnav123"},
	})
	cookie := sessionCookie(t, rec)

	// Create root group first
	rec = do(t, h, "POST", "/api/categories", reqOpts{
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
