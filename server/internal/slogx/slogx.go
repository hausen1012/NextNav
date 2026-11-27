package slogx

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Setup configures slog output based on environment.
// Defaults to clean console output: 2006-01-02 15:04:05 [LEVEL] msg key=val
// Set LOG_FORMAT=json for structured JSON output.
func Setup(debug bool) {
	level := slog.LevelInfo
	if debug {
		level = slog.LevelDebug
	}
	var handler slog.Handler
	if os.Getenv("LOG_FORMAT") == "json" {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	} else {
		handler = NewConsoleHandler(os.Stdout, level)
	}
	slog.SetDefault(slog.New(handler))
}

func Debug(msg string, args ...any) { slog.Debug(msg, args...) }
func Info(msg string, args ...any)  { slog.Info(msg, args...) }
func Warn(msg string, args ...any)  { slog.Warn(msg, args...) }
func Error(msg string, args ...any) { slog.Error(msg, args...) }

// ConsoleHandler formats log records into a human-readable format:
// 2006-01-02 15:04:05 [LEVEL] message key=val
type ConsoleHandler struct {
	mu     *sync.Mutex
	out    io.Writer
	level  slog.Level
	attrs  []slog.Attr
	groups []string
}

func NewConsoleHandler(out io.Writer, level slog.Level) *ConsoleHandler {
	return &ConsoleHandler{
		mu:    &sync.Mutex{},
		out:   out,
		level: level,
	}
}

func (h *ConsoleHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= h.level
}

func (h *ConsoleHandler) Handle(_ context.Context, r slog.Record) error {
	var buf bytes.Buffer

	// 1. Time (2006-01-02 15:04:05)
	t := r.Time
	if t.IsZero() {
		t = time.Now()
	}
	buf.WriteString(t.Format("2006-01-02 15:04:05"))
	buf.WriteByte(' ')

	// 2. Level [INFO], [WARN], [ERROR], [DEBUG]
	buf.WriteByte('[')
	buf.WriteString(r.Level.String())
	buf.WriteString("] ")

	// 3. Message
	buf.WriteString(r.Message)

	// 4. Attributes
	writeAttr := func(a slog.Attr, applyGroup bool) {
		a.Value = a.Value.Resolve()
		if a.Equal(slog.Attr{}) {
			return
		}
		buf.WriteByte(' ')
		key := a.Key
		if applyGroup && len(h.groups) > 0 {
			key = strings.Join(h.groups, ".") + "." + key
		}
		buf.WriteString(key)
		buf.WriteByte('=')
		appendValue(&buf, a.Value)
	}

	for _, a := range h.attrs {
		writeAttr(a, false)
	}

	r.Attrs(func(a slog.Attr) bool {
		writeAttr(a, true)
		return true
	})

	buf.WriteByte('\n')

	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := h.out.Write(buf.Bytes())
	return err
}

func appendValue(buf *bytes.Buffer, v slog.Value) {
	switch v.Kind() {
	case slog.KindString:
		appendString(buf, v.String())
	case slog.KindTime:
		buf.WriteString(v.Time().Format(time.RFC3339))
	case slog.KindDuration:
		buf.WriteString(v.Duration().String())
	default:
		appendString(buf, fmt.Sprint(v.Any()))
	}
}

func appendString(buf *bytes.Buffer, s string) {
	if needsQuoting(s) {
		buf.WriteString(strconv.Quote(s))
	} else {
		buf.WriteString(s)
	}
}

func needsQuoting(s string) bool {
	if s == "" {
		return true
	}
	for i := 0; i < len(s); i++ {
		b := s[i]
		if b <= ' ' || b == '=' || b == '"' {
			return true
		}
	}
	return false
}

func (h *ConsoleHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	if len(attrs) == 0 {
		return h
	}
	h2 := *h
	h2.attrs = cloneSlice(h.attrs)
	for _, a := range attrs {
		if len(h.groups) > 0 {
			a.Key = strings.Join(h.groups, ".") + "." + a.Key
		}
		h2.attrs = append(h2.attrs, a)
	}
	return &h2
}

func (h *ConsoleHandler) WithGroup(name string) slog.Handler {
	if name == "" {
		return h
	}
	h2 := *h
	h2.groups = append(cloneSlice(h.groups), name)
	return &h2
}

func cloneSlice[T any](s []T) []T {
	if len(s) == 0 {
		return nil
	}
	c := make([]T, len(s))
	copy(c, s)
	return c
}
