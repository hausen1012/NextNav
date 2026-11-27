package service

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"syscall"
	"time"

	"nextnav/internal/slogx"
	"nextnav/internal/store"
)

type CheckResult struct {
	Status     string  `json:"status"`
	HTTPStatus *int    `json:"httpStatus,omitempty"`
	LatencyMs  *int64  `json:"latencyMs,omitempty"`
	ErrorType  *string `json:"errorType,omitempty"`
	CheckedAt  int64   `json:"checkedAt"`
}

type CheckStatus struct {
	Running   bool  `json:"running"`
	Done      int   `json:"done"`
	Total     int   `json:"total"`
	StartedAt int64 `json:"startedAt"`
}

type checkerState struct {
	mu        sync.RWMutex
	running   bool
	done      int
	total     int
	startedAt int64
}

var globalChecker checkerState

func newCheckClient(policy FetchPolicy) *http.Client {
	return &http.Client{
		Timeout: policy.HealthTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= policy.HealthMaxRedirects {
				return errors.New("stopped after 5 redirects")
			}
			return nil
		},
		Transport: &http.Transport{
			TLSClientConfig:   &tls.Config{InsecureSkipVerify: false},
			DisableKeepAlives: true,
		},
	}
}

// PerformCheck conducts a single URL health check and classifies the outcome.
func (s *Service) PerformCheck(targetURL string) (status string, ok bool, httpStatus *int, latencyMs *int64, errorType *string) {
	policy, _ := s.fetchRuntime()
	client := newCheckClient(policy)

	start := time.Now()
	req, err := http.NewRequest(http.MethodHead, targetURL, nil)
	if err != nil {
		lat := time.Since(start).Milliseconds()
		errStr := "other"
		return "dead", false, nil, &lat, &errStr
	}
	req.Header.Set("User-Agent", policy.HealthUserAgent)

	resp, err := client.Do(req)

	// If HEAD failed or gave 403/405/501 (some servers reject HEAD), fall back to GET
	shouldFallbackGet := false
	if err == nil {
		if resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented || resp.StatusCode == http.StatusForbidden {
			shouldFallbackGet = true
			_ = resp.Body.Close()
		}
	}

	if shouldFallbackGet {
		getReq, getErr := http.NewRequest(http.MethodGet, targetURL, nil)
		if getErr == nil {
			getReq.Header.Set("User-Agent", policy.HealthUserAgent)
			getResp, gErr := client.Do(getReq)
			if gErr == nil {
				resp = getResp
				err = nil
			}
		}
	}

	lat := time.Since(start).Milliseconds()
	latencyMs = &lat

	if err != nil {
		errClass, st := classifyError(err)
		return st, false, nil, latencyMs, &errClass
	}
	defer resp.Body.Close()
	// Drain a small amount to prevent lingering socket resources
	_, _ = io.CopyN(io.Discard, resp.Body, policy.HealthDrainBytes)

	code := resp.StatusCode
	httpStatus = &code

	if code >= 200 && code < 400 {
		return "ok", true, httpStatus, latencyMs, nil
	}

	errType := "http"
	if code >= 500 {
		return "warn", false, httpStatus, latencyMs, &errType
	}
	return "dead", false, httpStatus, latencyMs, &errType
}

func classifyError(err error) (string, string) {
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "timeout", "warn"
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout", "warn"
	}

	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return "dns", "dead"
	}

	var certErr *tls.CertificateVerificationError
	if errors.As(err, &certErr) {
		return "tls", "warn"
	}
	var x509Unknown x509.UnknownAuthorityError
	if errors.As(err, &x509Unknown) {
		return "tls", "warn"
	}
	var x509Hostname x509.HostnameError
	if errors.As(err, &x509Hostname) {
		return "tls", "warn"
	}

	if errors.Is(err, syscall.ECONNREFUSED) || strings.Contains(strings.ToLower(err.Error()), "connection refused") {
		return "refused", "dead"
	}
	if strings.Contains(strings.ToLower(err.Error()), "redirect") {
		return "redirect", "dead"
	}

	return "other", "dead"
}

// CheckLink checks a single link synchronously and writes the result to the store.
func (s *Service) CheckLink(linkID int64) (*CheckResult, error) {
	link, err := s.store.GetLink(linkID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	status, ok, httpStatus, latencyMs, errorType := s.PerformCheck(link.URL)
	if err := s.store.RecordLinkCheck(linkID, ok, httpStatus, latencyMs, errorType, status); err != nil {
		return nil, err
	}

	return &CheckResult{
		Status:     status,
		HTTPStatus: httpStatus,
		LatencyMs:  latencyMs,
		ErrorType:  errorType,
		CheckedAt:  time.Now().UnixMilli(),
	}, nil
}

// StartCheckAll runs health check for all links in the background with the configured concurrency.
func (s *Service) StartCheckAll() (int, error) {
	globalChecker.mu.Lock()
	if globalChecker.running {
		globalChecker.mu.Unlock()
		return 0, ErrAlreadyRunning
	}

	links, err := s.store.ListLinks(true)
	if err != nil {
		globalChecker.mu.Unlock()
		return 0, err
	}

	total := len(links)
	globalChecker.running = true
	globalChecker.done = 0
	globalChecker.total = total
	globalChecker.startedAt = time.Now().UnixMilli()
	globalChecker.mu.Unlock()

	go func() {
		defer func() {
			globalChecker.mu.Lock()
			globalChecker.running = false
			globalChecker.mu.Unlock()
		}()

		policy, _ := s.fetchRuntime()
		concurrency := policy.HealthConcurrency
		sem := make(chan struct{}, concurrency)
		var wg sync.WaitGroup

		for _, l := range links {
			sem <- struct{}{}
			wg.Add(1)

			linkItem := l
			go func() {
				defer func() {
					<-sem
					wg.Done()
					globalChecker.mu.Lock()
					globalChecker.done++
					globalChecker.mu.Unlock()
				}()

				status, ok, httpStatus, latencyMs, errorType := s.PerformCheck(linkItem.URL)
				_ = s.store.RecordLinkCheck(linkItem.ID, ok, httpStatus, latencyMs, errorType, status)
			}()
		}

		wg.Wait()
		slogx.Info("link check all completed", "total", total)
	}()

	return total, nil
}

// GetCheckStatus returns the current background check progress.
func (s *Service) GetCheckStatus() CheckStatus {
	globalChecker.mu.RLock()
	defer globalChecker.mu.RUnlock()
	return CheckStatus{
		Running:   globalChecker.running,
		Done:      globalChecker.done,
		Total:     globalChecker.total,
		StartedAt: globalChecker.startedAt,
	}
}

// ListChecks returns paginated check results.
func (s *Service) ListChecks(status string, categoryID *int64, page, pageSize int) ([]store.CheckItem, int, error) {
	return s.store.ListChecks(status, categoryID, page, pageSize)
}

// ParseCheckInterval parses interval configuration like "1d", "6h", "off".
func ParseCheckInterval(interval string) (time.Duration, bool) {
	interval = strings.TrimSpace(strings.ToLower(interval))
	if interval == "" || interval == "off" || interval == "0" || interval == "false" {
		return 0, false
	}
	if interval == "1d" {
		return 24 * time.Hour, true
	}
	if strings.HasSuffix(interval, "d") {
		dStr := strings.TrimSuffix(interval, "d")
		dur, err := time.ParseDuration(dStr + "h")
		if err == nil {
			return dur * 24, true
		}
	}
	dur, err := time.ParseDuration(interval)
	if err != nil || dur <= 0 {
		return 0, false
	}
	return dur, true
}

// StartPeriodicChecker starts the recurring health check background worker.
func (s *Service) StartPeriodicChecker(ctx context.Context, intervalStr string) {
	dur, enabled := ParseCheckInterval(intervalStr)
	if !enabled {
		slogx.Info("periodic link checker disabled", "interval", intervalStr)
		return
	}

	slogx.Info("periodic link checker started", "interval", dur.String())
	go func() {
		ticker := time.NewTicker(dur)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				slogx.Info("periodic link checker stopped")
				return
			case <-ticker.C:
				slogx.Info("running scheduled periodic link check")
				_, _ = s.StartCheckAll()
			}
		}
	}()
}
