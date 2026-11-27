package service

import (
	"strings"
	"testing"
	"time"

	"nextnav/internal/store"
)

func TestFetchSettingsOverrideAndPersist(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	svc := New(st)
	if got := svc.GetFetchSettings(); got != defaultFetchSettings() {
		t.Fatalf("expected defaults, got %+v", got)
	}

	ua := "test-ua"
	metaTimeout := 1500
	workers := 3
	updated, err := svc.UpdateFetchSettings(UpdateFetchSettingsInput{
		HTMLUserAgent:     &ua,
		MetaTimeoutMs:     &metaTimeout,
		HealthConcurrency: &workers,
	})
	if err != nil {
		t.Fatalf("update fetch settings: %v", err)
	}
	if updated.HTMLUserAgent != ua || updated.MetaTimeoutMs != metaTimeout || updated.HealthConcurrency != workers {
		t.Fatalf("unexpected settings: %+v", updated)
	}

	policy, _ := svc.fetchRuntime()
	if policy.HTMLUserAgent != ua || policy.MetaTimeout != 1500*time.Millisecond || policy.HealthConcurrency != workers {
		t.Fatalf("runtime policy not updated: %+v", policy)
	}

	restarted := New(st)
	if got := restarted.GetFetchSettings(); got != updated {
		t.Fatalf("settings not persisted: got %+v, want %+v", got, updated)
	}
}

func TestFetchSettingsResetToDefault(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	svc := New(st)
	ua := "temporary-ua"
	metaTimeout := 9000
	if _, err := svc.UpdateFetchSettings(UpdateFetchSettingsInput{
		HTMLUserAgent: &ua,
		MetaTimeoutMs: &metaTimeout,
	}); err != nil {
		t.Fatalf("set overrides: %v", err)
	}

	empty := ""
	zero := 0
	reset, err := svc.UpdateFetchSettings(UpdateFetchSettingsInput{
		HTMLUserAgent: &empty,
		MetaTimeoutMs: &zero,
	})
	if err != nil {
		t.Fatalf("reset overrides: %v", err)
	}
	if reset != defaultFetchSettings() {
		t.Fatalf("expected defaults after reset, got %+v", reset)
	}
}

func TestFetchSettingsValidation(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()
	svc := New(st)

	longUA := strings.Repeat("a", maxFetchUALength+1)
	newlineUA := "ua\r\ninjected"
	lowTimeout := 50
	highTimeout := 200000
	lowBytes := 100
	highBytes := 20 * 1024 * 1024
	highWorkers := maxFetchWorkers + 1

	tests := []struct {
		name  string
		input UpdateFetchSettingsInput
	}{
		{"long ua", UpdateFetchSettingsInput{HTMLUserAgent: &longUA}},
		{"newline ua", UpdateFetchSettingsInput{HTMLUserAgent: &newlineUA}},
		{"low timeout", UpdateFetchSettingsInput{MetaTimeoutMs: &lowTimeout}},
		{"high timeout", UpdateFetchSettingsInput{HealthTimeoutMs: &highTimeout}},
		{"low bytes", UpdateFetchSettingsInput{HTMLMaxBytes: &lowBytes}},
		{"high bytes", UpdateFetchSettingsInput{IconMaxBytes: &highBytes}},
		{"high workers", UpdateFetchSettingsInput{HealthConcurrency: &highWorkers}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := svc.UpdateFetchSettings(tt.input); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}
