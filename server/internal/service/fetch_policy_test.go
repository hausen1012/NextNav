package service

import (
	"context"
	"net/http"
	"net/netip"
	"testing"
	"time"
)

func TestDefaultFetchPolicy(t *testing.T) {
	p := defaultFetchPolicy()

	if p.ClientTimeout != 4*time.Second || p.MetaTimeout != 3*time.Second || p.FaviconTimeout != 8*time.Second {
		t.Fatalf("unexpected request timeouts: %+v", p)
	}
	if p.DialTimeout != 5*time.Second || p.KeepAlive != 30*time.Second || p.TLSHandshakeTimeout != 5*time.Second ||
		p.ResponseHeaderTimeout != 5*time.Second {
		t.Fatalf("unexpected transport timeouts: %+v", p)
	}
	if p.HealthTimeout != 10*time.Second || p.HealthMaxRedirects != 5 || p.HealthConcurrency != 5 ||
		p.HealthDrainBytes != defaultHealthDrainBytes {
		t.Fatalf("unexpected health policy: %+v", p)
	}
	if p.HTMLMaxBytes != defaultHTMLMaxBytes || p.IconMaxBytes != defaultIconMaxBytes {
		t.Fatalf("unexpected size limits: %+v", p)
	}
	if p.HTMLUserAgent != defaultHTMLUserAgent || p.IconUserAgent != defaultIconUserAgent ||
		p.HealthUserAgent != defaultHealthUserAgent || p.HTMLAccept != defaultHTMLAccept || p.IconAccept != defaultIconAccept {
		t.Fatalf("unexpected request headers: %+v", p)
	}
	if !p.FakeIPPrefix.Contains(netip.MustParseAddr("198.18.1.245")) {
		t.Fatalf("unexpected fake-ip prefix: %v", p.FakeIPPrefix)
	}
	if len(p.BlockedOutboundPrefixes) != 25 {
		t.Fatalf("unexpected blocked prefix count: %d", len(p.BlockedOutboundPrefixes))
	}
}

func TestNewFetchRequest(t *testing.T) {
	req, err := newFetchRequest(context.Background(), http.MethodGet, "https://example.com", "test-ua", "test/accept")
	if err != nil {
		t.Fatalf("new fetch request: %v", err)
	}
	if got := req.Header.Get("User-Agent"); got != "test-ua" {
		t.Fatalf("User-Agent = %q", got)
	}
	if got := req.Header.Get("Accept"); got != "test/accept" {
		t.Fatalf("Accept = %q", got)
	}
	if req.Context() == nil {
		t.Fatal("request context is nil")
	}
}

func TestExtractIconHref(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{"icon", `<link rel="icon" href="/a.ico">`, "/a.ico"},
		{"shortcut icon", `<link rel="shortcut icon" href="/b.ico">`, "/b.ico"},
		{"href first", `<link href="/c.png" rel="icon">`, "/c.png"},
		{"apple icon", `<link rel="apple-touch-icon" href="/d.png">`, "/d.png"},
		{"none", `<title>test</title>`, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := extractIconHref(tt.body); got != tt.want {
				t.Fatalf("extractIconHref() = %q, want %q", got, tt.want)
			}
		})
	}
}
