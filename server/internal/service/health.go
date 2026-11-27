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
	"sync/atomic"
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

// applyHealthHeaders 为健康检测请求附加标准浏览器请求头，避免被目标站 WAF/反爬误拦。
func applyHealthHeaders(req *http.Request, ua string) {
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
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
	applyHealthHeaders(req, policy.HealthUserAgent)

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
			applyHealthHeaders(getReq, policy.HealthUserAgent)
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
		slogx.Warn("健康检测异常: 网络或服务不可达", "url", targetURL, "status", st, "errorType", errClass, "latencyMs", *latencyMs, "err", err)
		return st, false, nil, latencyMs, &errClass
	}
	defer resp.Body.Close()
	// Drain a small amount to prevent lingering socket resources
	_, _ = io.CopyN(io.Discard, resp.Body, policy.HealthDrainBytes)

	code := resp.StatusCode
	httpStatus = &code

	// 200 OK 为最常见健康状态，不打印告警日志
	if code == http.StatusOK {
		return "ok", true, httpStatus, latencyMs, nil
	}

	// 2xx（除200外）及 3xx（重定向）视为正常可达，但除200外均按要求打印告警日志
	if code >= 200 && code < 400 {
		slogx.Warn("健康检测异常: 返回非正常状态码", "url", targetURL, "status", "ok", "httpStatus", code, "errorType", "http", "latencyMs", *latencyMs)
		return "ok", true, httpStatus, latencyMs, nil
	}

	// 401（需鉴权）与 403（受限/WAF反爬拦截）：服务器在线且网络联通，判定为正常（标绿），同时保留异常日志
	if code == http.StatusUnauthorized || code == http.StatusForbidden {
		slogx.Warn("健康检测异常: 返回非正常状态码", "url", targetURL, "status", "ok", "httpStatus", code, "errorType", "http", "latencyMs", *latencyMs)
		return "ok", true, httpStatus, latencyMs, nil
	}

	errType := "http"
	st := "dead"
	// 5xx 服务端错误判定为 warn
	if code >= 500 {
		st = "warn"
	}
	slogx.Warn("健康检测异常: 返回非正常状态码", "url", targetURL, "status", st, "httpStatus", code, "errorType", errType, "latencyMs", *latencyMs)
	return st, false, httpStatus, latencyMs, &errType
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
		slogx.Error("健康检测查询链接失败", "linkId", linkID, "err", err)
		return nil, err
	}

	status, ok, httpStatus, latencyMs, errorType := s.PerformCheck(link.URL)
	if err := s.store.RecordLinkCheck(linkID, ok, httpStatus, latencyMs, errorType, status); err != nil {
		slogx.Error("保存健康检测结果失败", "linkId", linkID, "url", link.URL, "err", err)
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
		slogx.Error("全站健康检测获取链接列表失败", "err", err)
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
		var unhealthyCount atomic.Int64

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
				if !ok {
					unhealthyCount.Add(1)
				}
				if err := s.store.RecordLinkCheck(linkItem.ID, ok, httpStatus, latencyMs, errorType, status); err != nil {
					slogx.Error("保存健康检测结果失败", "linkId", linkItem.ID, "url", linkItem.URL, "err", err)
				}
			}()
		}

		wg.Wait()
		slogx.Info("全站链接健康检测完成", "total", total, "unhealthy", unhealthyCount.Load())
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
				slogx.Info("执行定时健康检测任务")
				if _, err := s.StartCheckAll(); err != nil && !errors.Is(err, ErrAlreadyRunning) {
					slogx.Error("定时健康检测启动失败", "err", err)
				}
			}
		}
	}()
}
