package service

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"syscall"
	"testing"
	"time"

	"nextnav/internal/store"
)

func TestParseCheckInterval(t *testing.T) {
	cases := []struct {
		input    string
		expected time.Duration
		enabled  bool
	}{
		{"off", 0, false},
		{"0", 0, false},
		{"false", 0, false},
		{"", 0, false},
		{"1d", 24 * time.Hour, true},
		{"2d", 48 * time.Hour, true},
		{"6h", 6 * time.Hour, true},
		{"30m", 30 * time.Minute, true},
		{"invalid", 0, false},
	}

	for _, c := range cases {
		dur, enabled := ParseCheckInterval(c.input)
		if enabled != c.enabled {
			t.Errorf("ParseCheckInterval(%q) enabled = %v, want %v", c.input, enabled, c.enabled)
		}
		if dur != c.expected {
			t.Errorf("ParseCheckInterval(%q) dur = %v, want %v", c.input, dur, c.expected)
		}
	}
}

func TestClassifyError(t *testing.T) {
	errType, status := classifyError(context.DeadlineExceeded)
	if errType != "timeout" || status != "warn" {
		t.Errorf("expected timeout/warn, got %s/%s", errType, status)
	}

	errType, status = classifyError(&net.DNSError{})
	if errType != "dns" || status != "dead" {
		t.Errorf("expected dns/dead, got %s/%s", errType, status)
	}

	errType, status = classifyError(syscall.ECONNREFUSED)
	if errType != "refused" || status != "dead" {
		t.Errorf("expected refused/dead, got %s/%s", errType, status)
	}

	errType, status = classifyError(errors.New("stopped after 5 redirects"))
	if errType != "redirect" || status != "dead" {
		t.Errorf("expected redirect/dead, got %s/%s", errType, status)
	}
}

func TestPerformCheck(t *testing.T) {
	// Test HTTP 200 OK
	tsOk := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer tsOk.Close()

	status, ok, httpStatus, latency, errType := PerformCheck(tsOk.URL)
	if status != "ok" || !ok || httpStatus == nil || *httpStatus != 200 || errType != nil {
		t.Fatalf("expected ok 200, got status=%s, ok=%v, http=%v, errType=%v", status, ok, httpStatus, errType)
	}
	if latency == nil || *latency < 0 {
		t.Fatalf("expected valid latency, got %v", latency)
	}

	// Test HTTP 404 Dead
	ts404 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer ts404.Close()

	status, ok, httpStatus, _, errType = PerformCheck(ts404.URL)
	if status != "dead" || ok || httpStatus == nil || *httpStatus != 404 || errType == nil || *errType != "http" {
		t.Fatalf("expected dead 404, got status=%s, ok=%v, http=%v, errType=%v", status, ok, httpStatus, errType)
	}

	// Test HTTP 500 Warn
	ts500 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts500.Close()

	status, ok, httpStatus, _, errType = PerformCheck(ts500.URL)
	if status != "warn" || ok || httpStatus == nil || *httpStatus != 500 || errType == nil || *errType != "http" {
		t.Fatalf("expected warn 500, got status=%s, ok=%v, http=%v, errType=%v", status, ok, httpStatus, errType)
	}
}

func TestCheckLinkAndListChecks(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	svc := New(st)

	// Create test category and link
	catID, err := st.CreateCategory(&store.Category{Name: "Test Category", Sort: 10})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	linkID, err := st.CreateLink(&store.Link{
		CategoryID: catID,
		Title:      "Test Link",
		URL:        ts.URL,
		Sort:       10,
		TitleNorm:  "test link",
		Host:       "127.0.0.1",
		SearchText: "test link",
	})
	if err != nil {
		t.Fatalf("create link: %v", err)
	}

	res, err := svc.CheckLink(linkID)
	if err != nil {
		t.Fatalf("check link: %v", err)
	}
	if res.Status != "ok" || res.HTTPStatus == nil || *res.HTTPStatus != 200 {
		t.Fatalf("unexpected check result: %+v", res)
	}

	// Check DB updated
	link, err := st.GetLink(linkID)
	if err != nil {
		t.Fatalf("get link: %v", err)
	}
	if link.LastStatus != "ok" || link.LastCheckedAt == nil {
		t.Fatalf("link not updated: status=%s, lastCheckedAt=%v", link.LastStatus, link.LastCheckedAt)
	}

	// List checks
	items, total, err := svc.ListChecks("ok", nil, 1, 10)
	if err != nil {
		t.Fatalf("list checks: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("expected 1 item, got total=%d, len=%d", total, len(items))
	}
	if items[0].LinkID != linkID || items[0].Status != "ok" {
		t.Fatalf("unexpected check item: %+v", items[0])
	}
}
