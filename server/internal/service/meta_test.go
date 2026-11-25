package service_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"nextnav/internal/service"
	"nextnav/internal/store"
)

// Minimal 1x1 valid PNG bytes
var samplePNG = []byte{
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

func TestFetchMetaAndIcon(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/custom-icon.png" {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(samplePNG)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Test Page Title</title>
				<meta name="description" content="Test Page Description" />
				<link rel="icon" href="/custom-icon.png" />
			</head>
			<body><h1>Hello</h1></body>
			</html>
		`))
	}))
	defer ts.Close()

	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	svc := service.New(st)

	res, err := svc.FetchMeta(ts.URL)
	if err != nil {
		t.Fatalf("fetch meta failed: %v", err)
	}

	if res.Title != "Test Page Title" {
		t.Errorf("expected title 'Test Page Title', got %q", res.Title)
	}
	if res.Description != "Test Page Description" {
		t.Errorf("expected description 'Test Page Description', got %q", res.Description)
	}
	if res.IconPath == nil || !strings.HasPrefix(*res.IconPath, "icons/") {
		t.Errorf("expected valid IconPath, got %v", res.IconPath)
	}
	if res.IconURL == nil || !strings.HasPrefix(*res.IconURL, "/icons/") {
		t.Errorf("expected valid IconURL, got %v", res.IconURL)
	}

	// Verify icon file was written
	fullPath := filepath.Join(dir, filepath.FromSlash(*res.IconPath))
	if _, err := os.Stat(fullPath); err != nil {
		t.Errorf("saved icon file does not exist: %v", err)
	}
}

func TestSaveAndRemoveLogo(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	svc := service.New(st)

	// Save valid logo
	logoURL, err := svc.SaveLogo(samplePNG, "logo.png")
	if err != nil {
		t.Fatalf("save logo: %v", err)
	}
	if !strings.HasPrefix(logoURL, "/icons/") {
		t.Errorf("expected /icons/ prefix, got %q", logoURL)
	}

	site := svc.GetPublicSite()
	if site.LogoURL == nil || *site.LogoURL != logoURL {
		t.Errorf("expected site.LogoURL %q, got %v", logoURL, site.LogoURL)
	}

	// Reject SVG
	_, err = svc.SaveLogo([]byte("<svg></svg>"), "logo.svg")
	if err == nil {
		t.Error("expected error for svg logo, got nil")
	}

	// Remove logo
	if err := svc.RemoveLogo(); err != nil {
		t.Fatalf("remove logo: %v", err)
	}

	siteAfter := svc.GetPublicSite()
	if siteAfter.LogoURL != nil {
		t.Errorf("expected nil LogoURL after remove, got %v", siteAfter.LogoURL)
	}
}
