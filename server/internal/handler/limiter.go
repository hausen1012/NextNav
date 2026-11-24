package handler

import (
	"sync"
	"time"
)

const (
	loginMaxFailures = 10
	loginWindow      = 10 * time.Minute
)

type failureEntry struct {
	count int
	since time.Time
}

// ipLimiter is a tiny in-memory failure counter for login attempts.
// It is intentionally not persisted: restarting the process clears it.
type ipLimiter struct {
	mu   sync.Mutex
	data map[string]*failureEntry
}

func newIPLimiter() *ipLimiter {
	return &ipLimiter{data: make(map[string]*failureEntry)}
}

func (l *ipLimiter) blocked(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.data[ip]
	if !ok {
		return false
	}
	if time.Since(e.since) > loginWindow {
		delete(l.data, ip)
		return false
	}
	return e.count >= loginMaxFailures
}

func (l *ipLimiter) fail(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.data[ip]
	if !ok || time.Since(e.since) > loginWindow {
		l.data[ip] = &failureEntry{count: 1, since: time.Now()}
		return
	}
	e.count++
}

func (l *ipLimiter) reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.data, ip)
}
