package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"nextnav/internal/service"
)

func TestFaviconAccessPolicyMatchesDomains(t *testing.T) {
	policy := newFaviconAccessPolicy(" Nav.Example.com, *.Example.org, *, invalid.example/path ")
	if !policy.allowsHost("nav.example.com") {
		t.Fatal("exact domain should match")
	}
	if !policy.allowsHost("www.example.org") || !policy.allowsHost("example.org") {
		t.Fatal("wildcard domain should match apex and subdomains")
	}
	if !policy.allowsHost("any.example.net") {
		t.Fatal("wildcard * should match any domain")
	}
}

func TestFaviconAccessPolicyWithoutWildcard(t *testing.T) {
	policy := newFaviconAccessPolicy("example.com,*.example.org")
	if !policy.allowsHost("EXAMPLE.COM.") {
		t.Fatal("domain matching should ignore case and trailing dot")
	}
	if policy.allowsHost("sub.example.com") {
		t.Fatal("exact domain should not match subdomains")
	}
	if policy.allowsHost("example.com.evil.com") {
		t.Fatal("lookalike domain should not match")
	}
	if !policy.allowsHost("sub.example.org") {
		t.Fatal("wildcard domain should match subdomains")
	}
}

func TestFaviconAccessPolicyAcceptsLineSeparatedDomains(t *testing.T) {
	policy := newFaviconAccessPolicy("nav.example.com\n*.example.org\r\nfoo.example.net")
	if !policy.allowsHost("nav.example.com") || !policy.allowsHost("app.example.org") || !policy.allowsHost("foo.example.net") {
		t.Fatal("line-separated domains should be parsed")
	}
}

func TestFaviconAccessMiddleware(t *testing.T) {
	tests := []struct {
		name      string
		remote    string
		host      string
		referer   string
		origin    string
		fetchSite string
		xff       string
		want      int
	}{
		{name: "allowed referer", remote: "203.0.113.10:1234", host: "nav.example.com", referer: "https://nav.example.com/page", want: http.StatusNoContent},
		{name: "allowed referer with port", remote: "203.0.113.10:1234", host: "nav.example.com", referer: "http://nav.example.com:8080/page", want: http.StatusNoContent},
		{name: "allowed wildcard subdomain", remote: "203.0.113.10:1234", host: "nav.example.com", referer: "https://app.example.org/page", want: http.StatusNoContent},
		{name: "allowed origin", remote: "203.0.113.10:1234", host: "nav.example.com", origin: "https://nav.example.com", want: http.StatusNoContent},
		{name: "same origin without referer", remote: "203.0.113.10:1234", host: "nav.example.com", fetchSite: "same-origin", want: http.StatusNoContent},
		{name: "disallowed referer", remote: "203.0.113.10:1234", host: "nav.example.com", referer: "https://evil.example/page", want: http.StatusForbidden},
		{name: "lookalike referer", remote: "203.0.113.10:1234", host: "nav.example.com", referer: "https://nav.example.com.evil.example/page", want: http.StatusForbidden},
		{name: "missing source with allowed host", remote: "203.0.113.10:1234", host: "nav.example.com", want: http.StatusNoContent},
		{name: "cross site without referer with allowed host", remote: "203.0.113.10:1234", host: "nav.example.com", fetchSite: "cross-site", want: http.StatusNoContent},
		{name: "malformed referer", remote: "203.0.113.10:1234", host: "nav.example.com", referer: "://bad", want: http.StatusForbidden},
		{name: "loopback ip with allowed host", remote: "127.0.0.1:1234", host: "nav.example.com", want: http.StatusNoContent},
		{name: "private ip with allowed host", remote: "192.168.1.20:1234", host: "nav.example.com", want: http.StatusNoContent},
		{name: "spoofed forwarded private ip with allowed host", remote: "10.0.0.2:1234", host: "nav.example.com", xff: "192.168.1.20", want: http.StatusNoContent},
		{name: "proxy forwarded public client with allowed host", remote: "127.0.0.1:1234", host: "nav.example.com", xff: "203.0.113.10", want: http.StatusNoContent},
		{name: "missing source with foreign host", remote: "203.0.113.10:1234", host: "other.example", want: http.StatusForbidden},
		{name: "cross site with foreign host", remote: "203.0.113.10:1234", host: "other.example", fetchSite: "cross-site", want: http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			api, _ := newTestAPIWithFaviconDomains(t, "nav.example.com,*.example.org")
			called := false
			h := api.faviconAccess(func(w http.ResponseWriter, _ *http.Request) {
				called = true
				w.WriteHeader(http.StatusNoContent)
			})
			req := httptest.NewRequest(http.MethodGet, "/api/favicon/example.com.png", nil)
			req.Host = tt.host
			req.RemoteAddr = tt.remote
			if tt.referer != "" {
				req.Header.Set("Referer", tt.referer)
			}
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if tt.fetchSite != "" {
				req.Header.Set("Sec-Fetch-Site", tt.fetchSite)
			}
			if tt.xff != "" {
				req.Header.Set("X-Forwarded-For", tt.xff)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d", rec.Code, tt.want)
			}
			if called != (tt.want == http.StatusNoContent) {
				t.Fatalf("next called = %v", called)
			}
		})
	}
}

func TestFaviconAccessEmptyPolicyAllowsSameHost(t *testing.T) {
	api, _ := newTestAPIWithFaviconDomains(t, "")
	h := api.faviconAccess(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	tests := []struct {
		name      string
		host      string
		referer   string
		fetchSite string
		want      int
	}{
		{name: "same host", host: "test.com:5173", referer: "http://test.com:5173/page", want: http.StatusNoContent},
		{name: "same host with port", host: "test.com", referer: "https://test.com/", want: http.StatusNoContent},
		{name: "foreign referer", host: "test.com:5173", referer: "https://evil.example/", want: http.StatusForbidden},
		{name: "same origin header", host: "test.com:5173", fetchSite: "same-origin", want: http.StatusNoContent},
		{name: "no source", host: "test.com:5173", want: http.StatusNoContent},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/favicon/example.com.png", nil)
			req.Host = tt.host
			req.RemoteAddr = "127.0.0.1:1234"
			if tt.referer != "" {
				req.Header.Set("Referer", tt.referer)
			}
			if tt.fetchSite != "" {
				req.Header.Set("Sec-Fetch-Site", tt.fetchSite)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d", rec.Code, tt.want)
			}
		})
	}
}

func TestFaviconAccessWildcardAllowsMissingSource(t *testing.T) {
	api, _ := newTestAPIWithFaviconDomains(t, "*")
	h := api.faviconAccess(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	req := httptest.NewRequest(http.MethodGet, "/api/favicon/example.com.png", nil)
	req.RemoteAddr = "203.0.113.10:1234"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestFaviconRouteEnforcesAccess(t *testing.T) {
	api, h := newTestAPIWithFaviconDomains(t, "nav.example.com")
	relPath, err := api.Service.SaveIconContent(dummyPNG, "example.png")
	if err != nil {
		t.Fatalf("save icon: %v", err)
	}
	if err := api.Service.Store().SetFaviconCache("example.com", relPath); err != nil {
		t.Fatalf("cache favicon: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/favicon/example.com.png", nil)
	req.RemoteAddr = "203.0.113.10:1234"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("public request without source: status = %d, want 403", rec.Code)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("denied response should not be cached")
	}

	req = httptest.NewRequest(http.MethodGet, "/api/favicon/example.com.png", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("loopback request without source: status = %d, want 403", rec.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/favicon/example.com.png", nil)
	req.RemoteAddr = "203.0.113.10:1234"
	req.Header.Set("Referer", "https://nav.example.com/")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("allowed request: status = %d, want 200", rec.Code)
	}
	if rec.Header().Get("Cache-Control") != "private, max-age=86400" {
		t.Fatalf("favicon response should use private caching")
	}
	vary := strings.Join(rec.Header().Values("Vary"), ",")
	for _, header := range []string{"Referer", "Origin", "Sec-Fetch-Site"} {
		if !strings.Contains(vary, header) {
			t.Fatalf("Vary should include %s, got %q", header, vary)
		}
	}
}

func TestFaviconAccessFollowsRuntimeSettings(t *testing.T) {
	api, h := newTestAPIWithFaviconDomains(t, "nav.example.com")
	relPath, err := api.Service.SaveIconContent(dummyPNG, "example.png")
	if err != nil {
		t.Fatalf("save icon: %v", err)
	}
	if err := api.Service.Store().SetFaviconCache("example.com", relPath); err != nil {
		t.Fatalf("cache favicon: %v", err)
	}

	requestStatus := func(referer string) int {
		req := httptest.NewRequest(http.MethodGet, "/api/favicon/example.com.png", nil)
		req.RemoteAddr = "203.0.113.10:1234"
		if referer != "" {
			req.Header.Set("Referer", referer)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if got := requestStatus("https://nav.example.com/"); got != http.StatusOK {
		t.Fatalf("old domain status = %d, want 200", got)
	}
	if got := requestStatus("https://new.example.com/"); got != http.StatusForbidden {
		t.Fatalf("new domain status = %d, want 403", got)
	}

	domains := "new.example.com"
	if _, err := api.Service.UpdateFetchSettings(service.UpdateFetchSettingsInput{FaviconAllowedDomains: &domains}); err != nil {
		t.Fatalf("update favicon allowed domains: %v", err)
	}

	if got := requestStatus("https://nav.example.com/"); got != http.StatusForbidden {
		t.Fatalf("old domain status after update = %d, want 403", got)
	}
	if got := requestStatus("https://new.example.com/"); got != http.StatusOK {
		t.Fatalf("new domain status after update = %d, want 200", got)
	}
}
