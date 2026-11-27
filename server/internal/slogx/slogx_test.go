package slogx

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
	"time"
)

func TestConsoleHandlerOutput(t *testing.T) {
	var buf bytes.Buffer
	handler := NewConsoleHandler(&buf, slog.LevelInfo)
	logger := slog.New(handler)

	fixedTime := time.Date(2026, 11, 27, 13, 12, 32, 0, time.Local)
	r := slog.NewRecord(fixedTime, slog.LevelWarn, "获取网站信息失败: 网络请求异常", 0)
	r.Add("url", "https://example.com")
	r.Add("err", "dial tcp: lookup fail")

	if err := handler.Handle(nil, r); err != nil {
		t.Fatalf("handle error: %v", err)
	}

	out := buf.String()
	t.Logf("output: %s", out)

	expectedPrefix := "2026-11-27 13:12:32 [WARN] 获取网站信息失败: 网络请求异常 url=https://example.com"
	if !strings.HasPrefix(out, expectedPrefix) {
		t.Errorf("expected output to start with %q, got: %q", expectedPrefix, out)
	}
	if !strings.Contains(out, `err="dial tcp: lookup fail"`) {
		t.Errorf("expected err with quotes, got: %q", out)
	}

	// Test WithAttrs & WithGroup
	buf.Reset()
	subLogger := logger.With("service", "meta").WithGroup("http")
	subLogger.Info("测试分组", "status", 200)
	subOut := buf.String()
	t.Logf("sub output: %s", subOut)
	if !strings.Contains(subOut, "[INFO] 测试分组 service=meta http.status=200") {
		t.Errorf("expected grouped attrs, got: %q", subOut)
	}
}
