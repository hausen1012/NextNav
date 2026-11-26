package service

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"nextnav/internal/store"
)

type fakeOutboundResolver map[string][]net.IP

func (r fakeOutboundResolver) LookupIPAddr(ctx context.Context, host string) ([]net.IPAddr, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	ips, ok := r[host]
	if !ok {
		return nil, &net.DNSError{Err: "no such host", Name: host}
	}
	result := make([]net.IPAddr, 0, len(ips))
	for _, ip := range ips {
		result = append(result, net.IPAddr{IP: ip})
	}
	return result, nil
}

func TestSafeHTTPClientBlocksPrivateAddress(t *testing.T) {
	var hits atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write([]byte("private"))
	}))
	defer ts.Close()

	client := newSafeHTTPClient(time.Second)
	resp, err := client.Get(ts.URL)
	if resp != nil {
		_ = resp.Body.Close()
	}
	if !errors.Is(err, errBlockedOutboundAddress) {
		t.Fatalf("expected blocked outbound address, got %v", err)
	}
	if got := hits.Load(); got != 0 {
		t.Fatalf("expected no requests to private target, got %d", got)
	}
}

func TestSafeHTTPClientDialsResolvedPublicAddress(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer ts.Close()

	var dialed []string
	dial := func(ctx context.Context, network, address string) (net.Conn, error) {
		dialed = append(dialed, address)
		return (&net.Dialer{}).DialContext(ctx, network, ts.Listener.Addr().String())
	}
	resolver := fakeOutboundResolver{"public.test": {net.ParseIP("8.8.8.8")}}
	client := newSafeHTTPClientWith(time.Second, resolver, dial)

	resp, err := client.Get("http://public.test/")
	if err != nil {
		t.Fatalf("get public test: %v", err)
	}
	_ = resp.Body.Close()
	if len(dialed) != 1 || dialed[0] != "8.8.8.8:80" {
		t.Fatalf("expected dial to resolved public IP, got %v", dialed)
	}
}

func TestSafeHTTPClientSkipsPrivateDNSResults(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer ts.Close()

	var dialed []string
	dial := func(ctx context.Context, network, address string) (net.Conn, error) {
		dialed = append(dialed, address)
		return (&net.Dialer{}).DialContext(ctx, network, ts.Listener.Addr().String())
	}
	resolver := fakeOutboundResolver{
		"public.test": {net.ParseIP("127.0.0.1"), net.ParseIP("8.8.8.8")},
	}
	client := newSafeHTTPClientWith(time.Second, resolver, dial)

	resp, err := client.Get("http://public.test/")
	if err != nil {
		t.Fatalf("get public test: %v", err)
	}
	_ = resp.Body.Close()
	if len(dialed) != 1 || dialed[0] != "8.8.8.8:80" {
		t.Fatalf("expected only public IP to be dialed, got %v", dialed)
	}
}

func TestSafeHTTPClientDialsDNSProxyFakeIP(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer ts.Close()

	var dialed []string
	dial := func(ctx context.Context, network, address string) (net.Conn, error) {
		dialed = append(dialed, address)
		return (&net.Dialer{}).DialContext(ctx, network, ts.Listener.Addr().String())
	}
	resolver := fakeOutboundResolver{"public.test": {net.ParseIP("198.18.1.245")}}
	client := newSafeHTTPClientWith(time.Second, resolver, dial)

	resp, err := client.Get("http://public.test/")
	if err != nil {
		t.Fatalf("get fake-ip target: %v", err)
	}
	_ = resp.Body.Close()
	if len(dialed) != 1 || dialed[0] != "198.18.1.245:80" {
		t.Fatalf("expected dial to fake-ip address, got %v", dialed)
	}
}

func TestSafeHTTPClientBlocksFakeIPLiteral(t *testing.T) {
	var dialed []string
	dial := func(ctx context.Context, network, address string) (net.Conn, error) {
		dialed = append(dialed, address)
		return (&net.Dialer{}).DialContext(ctx, network, address)
	}
	resolver := fakeOutboundResolver{"198.18.1.245": {net.ParseIP("198.18.1.245")}}
	client := newSafeHTTPClientWith(time.Second, resolver, dial)

	resp, err := client.Get("http://198.18.1.245/")
	if resp != nil {
		_ = resp.Body.Close()
	}
	if !errors.Is(err, errBlockedOutboundAddress) {
		t.Fatalf("expected blocked fake-ip literal, got %v", err)
	}
	if len(dialed) != 0 {
		t.Fatalf("expected no dial to fake-ip literal, got %v", dialed)
	}
}

func TestSafeHTTPClientRejectsPrivateRedirect(t *testing.T) {
	var privateHits atomic.Int32
	var ts *httptest.Server
	ts = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/private" {
			privateHits.Add(1)
			_, _ = w.Write([]byte("private"))
			return
		}
		http.Redirect(w, r, ts.URL+"/private", http.StatusFound)
	}))
	defer ts.Close()

	var dialed []string
	dial := func(ctx context.Context, network, address string) (net.Conn, error) {
		dialed = append(dialed, address)
		return (&net.Dialer{}).DialContext(ctx, network, ts.Listener.Addr().String())
	}
	resolver := fakeOutboundResolver{
		"public.test": {net.ParseIP("8.8.8.8")},
		"127.0.0.1":   {net.ParseIP("127.0.0.1")},
	}
	client := newSafeHTTPClientWith(time.Second, resolver, dial)

	resp, err := client.Get("http://public.test/start")
	if resp != nil {
		_ = resp.Body.Close()
	}
	if !errors.Is(err, errBlockedOutboundAddress) {
		t.Fatalf("expected private redirect to be blocked, got %v", err)
	}
	if got := privateHits.Load(); got != 0 {
		t.Fatalf("expected no requests to redirect target, got %d", got)
	}
	if len(dialed) != 1 || dialed[0] != "8.8.8.8:80" {
		t.Fatalf("expected only initial public address to be dialed, got %v", dialed)
	}
}

func TestValidateOutboundURL(t *testing.T) {
	tests := []struct {
		raw string
		ok  bool
	}{
		{"http://example.com", true},
		{"https://example.com/path", true},
		{"https://[2606:4700:4700::1111]/", true},
		{"file:///etc/passwd", false},
		{"ftp://example.com/file", false},
		{"http:///missing-host", false},
		{"http:example.com", false},
		{"mailto:user@example.com", false},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			u, err := url.Parse(tt.raw)
			if err != nil {
				t.Fatalf("parse url: %v", err)
			}
			err = validateOutboundURL(u)
			if tt.ok && err != nil {
				t.Fatalf("expected allowed url, got %v", err)
			}
			if !tt.ok && !errors.Is(err, errBlockedOutboundAddress) {
				t.Fatalf("expected blocked url, got %v", err)
			}
		})
	}
}

func TestIsPublicOutboundIP(t *testing.T) {
	tests := []struct {
		ip   string
		want bool
	}{
		{"8.8.8.8", true},
		{"1.1.1.1", true},
		{"2606:4700:4700::1111", true},
		{"10.0.0.1", false},
		{"100.64.0.1", false},
		{"127.0.0.1", false},
		{"169.254.1.1", false},
		{"172.16.0.1", false},
		{"192.0.2.1", false},
		{"192.168.1.1", false},
		{"198.18.0.1", false},
		{"224.0.0.1", false},
		{"240.0.0.1", false},
		{"::", false},
		{"::1", false},
		{"::127.0.0.1", false},
		{"::ffff:127.0.0.1", false},
		{"64:ff9b::808:808", false},
		{"64:ff9b:1::1", false},
		{"100::1", false},
		{"2001:db8::1", false},
		{"2002:7f00:1::", false},
		{"fc00::1", false},
		{"fe80::1", false},
		{"ff02::1", false},
	}
	for _, tt := range tests {
		t.Run(tt.ip, func(t *testing.T) {
			if got := isPublicOutboundIP(net.ParseIP(tt.ip)); got != tt.want {
				t.Fatalf("isPublicOutboundIP(%q) = %v, want %v", tt.ip, got, tt.want)
			}
		})
	}
}

func TestFetchMetaBlocksPrivateIcon(t *testing.T) {
	var iconHits atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/icon.png" {
			iconHits.Add(1)
			_, _ = w.Write(samplePNG)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<title>public page</title><link rel="icon" href="http://private.test/icon.png">`))
	}))
	defer ts.Close()

	var dialed []string
	dial := func(ctx context.Context, network, address string) (net.Conn, error) {
		dialed = append(dialed, address)
		return (&net.Dialer{}).DialContext(ctx, network, ts.Listener.Addr().String())
	}
	resolver := fakeOutboundResolver{
		"public.test":  {net.ParseIP("8.8.8.8")},
		"private.test": {net.ParseIP("127.0.0.1")},
	}
	client := newSafeHTTPClientWith(time.Second, resolver, dial)

	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()
	svc := New(st)
	svc.fetchClient = client

	res, err := svc.FetchMeta("http://public.test/")
	if err != nil {
		t.Fatalf("fetch meta failed: %v", err)
	}
	if res.Title != "public page" {
		t.Fatalf("expected page metadata, got %+v", res)
	}
	if res.IconPath != nil || res.IconURL != nil {
		t.Fatalf("expected private icon to be omitted, got %+v", res)
	}
	if got := iconHits.Load(); got != 0 {
		t.Fatalf("expected no requests to private icon, got %d", got)
	}
	if len(dialed) != 1 || dialed[0] != "8.8.8.8:80" {
		t.Fatalf("expected only public page address to be dialed, got %v", dialed)
	}
}

func TestGetOrFetchFaviconBlocksPrivateAddress(t *testing.T) {
	var hits atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(samplePNG)
	}))
	defer ts.Close()

	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	svc := New(st)
	domain := strings.TrimPrefix(ts.URL, "http://")
	if _, err := svc.GetOrFetchFavicon(context.Background(), domain); !errors.Is(err, ErrFaviconNotFound) {
		t.Fatalf("expected favicon not found for blocked target, got %v", err)
	}
	if got := hits.Load(); got != 0 {
		t.Fatalf("expected no requests to private favicon target, got %d", got)
	}
}
