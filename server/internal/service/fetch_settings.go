package service

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	settingFetchHTMLUserAgent   = "fetch.html_user_agent"
	settingFetchIconUserAgent   = "fetch.icon_user_agent"
	settingFetchHealthUserAgent = "fetch.health_user_agent"
	settingFetchClientTimeout   = "fetch.client_timeout_ms"
	settingFetchMetaTimeout     = "fetch.meta_timeout_ms"
	settingFetchFaviconTimeout  = "fetch.favicon_timeout_ms"
	settingFetchHealthTimeout   = "fetch.health_timeout_ms"
	settingFetchHTMLMaxBytes    = "fetch.html_max_bytes"
	settingFetchIconMaxBytes    = "fetch.icon_max_bytes"
	settingFetchHealthWorkers   = "fetch.health_concurrency"
)

const (
	minFetchTimeoutMs = 100
	maxFetchTimeoutMs = 120000
	minFetchBytes     = 1024
	maxFetchBytes     = 10 * 1024 * 1024
	maxFetchWorkers   = 50
	maxFetchUALength  = 512
)

// FetchSettingsDTO 是可运行时修改的网络请求与外联参数；安全基线保持只读。
type FetchSettingsDTO struct {
	HTMLUserAgent     string `json:"htmlUserAgent"`
	IconUserAgent     string `json:"iconUserAgent"`
	HealthUserAgent   string `json:"healthUserAgent"`
	ClientTimeoutMs   int    `json:"clientTimeoutMs"`
	MetaTimeoutMs     int    `json:"metaTimeoutMs"`
	FaviconTimeoutMs  int    `json:"faviconTimeoutMs"`
	HealthTimeoutMs   int    `json:"healthTimeoutMs"`
	HTMLMaxBytes      int    `json:"htmlMaxBytes"`
	IconMaxBytes      int    `json:"iconMaxBytes"`
	HealthConcurrency int    `json:"healthConcurrency"`
}

// UpdateFetchSettingsInput 的 nil 字段表示不修改；空字符串或 0 表示恢复代码默认值。
type UpdateFetchSettingsInput struct {
	HTMLUserAgent     *string `json:"htmlUserAgent"`
	IconUserAgent     *string `json:"iconUserAgent"`
	HealthUserAgent   *string `json:"healthUserAgent"`
	ClientTimeoutMs   *int    `json:"clientTimeoutMs"`
	MetaTimeoutMs     *int    `json:"metaTimeoutMs"`
	FaviconTimeoutMs  *int    `json:"faviconTimeoutMs"`
	HealthTimeoutMs   *int    `json:"healthTimeoutMs"`
	HTMLMaxBytes      *int    `json:"htmlMaxBytes"`
	IconMaxBytes      *int    `json:"iconMaxBytes"`
	HealthConcurrency *int    `json:"healthConcurrency"`
}

func defaultFetchSettings() FetchSettingsDTO {
	p := defaultFetchPolicy()
	return FetchSettingsDTO{
		HTMLUserAgent:     p.HTMLUserAgent,
		IconUserAgent:     p.IconUserAgent,
		HealthUserAgent:   p.HealthUserAgent,
		ClientTimeoutMs:   int(p.ClientTimeout / time.Millisecond),
		MetaTimeoutMs:     int(p.MetaTimeout / time.Millisecond),
		FaviconTimeoutMs:  int(p.FaviconTimeout / time.Millisecond),
		HealthTimeoutMs:   int(p.HealthTimeout / time.Millisecond),
		HTMLMaxBytes:      int(p.HTMLMaxBytes),
		IconMaxBytes:      int(p.IconMaxBytes),
		HealthConcurrency: p.HealthConcurrency,
	}
}

func (s *Service) fetchSettingsFromStore() FetchSettingsDTO {
	d := defaultFetchSettings()
	d.HTMLUserAgent = s.store.GetSetting(settingFetchHTMLUserAgent, d.HTMLUserAgent)
	d.IconUserAgent = s.store.GetSetting(settingFetchIconUserAgent, d.IconUserAgent)
	d.HealthUserAgent = s.store.GetSetting(settingFetchHealthUserAgent, d.HealthUserAgent)
	d.ClientTimeoutMs = s.settingInt(settingFetchClientTimeout, d.ClientTimeoutMs)
	d.MetaTimeoutMs = s.settingInt(settingFetchMetaTimeout, d.MetaTimeoutMs)
	d.FaviconTimeoutMs = s.settingInt(settingFetchFaviconTimeout, d.FaviconTimeoutMs)
	d.HealthTimeoutMs = s.settingInt(settingFetchHealthTimeout, d.HealthTimeoutMs)
	d.HTMLMaxBytes = s.settingInt(settingFetchHTMLMaxBytes, d.HTMLMaxBytes)
	d.IconMaxBytes = s.settingInt(settingFetchIconMaxBytes, d.IconMaxBytes)
	d.HealthConcurrency = s.settingInt(settingFetchHealthWorkers, d.HealthConcurrency)
	return d
}

func (s *Service) settingInt(key string, def int) int {
	v := s.store.GetSetting(key, "")
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func fetchPolicyFromSettings(d FetchSettingsDTO) FetchPolicy {
	p := defaultFetchPolicy()
	p.HTMLUserAgent = d.HTMLUserAgent
	p.IconUserAgent = d.IconUserAgent
	p.HealthUserAgent = d.HealthUserAgent
	p.ClientTimeout = fetchDuration(d.ClientTimeoutMs, p.ClientTimeout)
	p.MetaTimeout = fetchDuration(d.MetaTimeoutMs, p.MetaTimeout)
	p.FaviconTimeout = fetchDuration(d.FaviconTimeoutMs, p.FaviconTimeout)
	p.HealthTimeout = fetchDuration(d.HealthTimeoutMs, p.HealthTimeout)
	p.HTMLMaxBytes = int64(fetchBounded(d.HTMLMaxBytes, minFetchBytes, maxFetchBytes, int(p.HTMLMaxBytes)))
	p.IconMaxBytes = int64(fetchBounded(d.IconMaxBytes, minFetchBytes, maxFetchBytes, int(p.IconMaxBytes)))
	p.HealthConcurrency = fetchBounded(d.HealthConcurrency, 1, maxFetchWorkers, p.HealthConcurrency)
	return p
}

func fetchDuration(ms int, def time.Duration) time.Duration {
	if ms < minFetchTimeoutMs || ms > maxFetchTimeoutMs {
		return def
	}
	return time.Duration(ms) * time.Millisecond
}

func fetchBounded(v, min, max, def int) int {
	if v < min || v > max {
		return def
	}
	return v
}

func (s *Service) applyFetchSettings() {
	settings := s.fetchSettingsFromStore()
	policy := fetchPolicyFromSettings(settings)
	client := newSafeHTTPClientForPolicy(policy)

	s.fetchMu.Lock()
	previous := s.fetchClient
	s.fetchSettings = settings
	s.fetchPolicy = policy
	s.fetchClient = client
	s.fetchMu.Unlock()

	if previous != nil {
		previous.CloseIdleConnections()
	}
}

func (s *Service) GetFetchSettings() FetchSettingsDTO {
	s.fetchMu.RLock()
	defer s.fetchMu.RUnlock()
	return s.fetchSettings
}

func (s *Service) fetchRuntime() (FetchPolicy, *http.Client) {
	s.fetchMu.RLock()
	defer s.fetchMu.RUnlock()
	return s.fetchPolicy, s.fetchClient
}

func (s *Service) UpdateFetchSettings(input UpdateFetchSettingsInput) (FetchSettingsDTO, error) {
	if err := validateFetchSettings(input); err != nil {
		return FetchSettingsDTO{}, err
	}

	if err := s.writeFetchString(settingFetchHTMLUserAgent, input.HTMLUserAgent); err != nil {
		return FetchSettingsDTO{}, err
	}
	if err := s.writeFetchString(settingFetchIconUserAgent, input.IconUserAgent); err != nil {
		return FetchSettingsDTO{}, err
	}
	if err := s.writeFetchString(settingFetchHealthUserAgent, input.HealthUserAgent); err != nil {
		return FetchSettingsDTO{}, err
	}
	if err := s.writeFetchInt(settingFetchClientTimeout, input.ClientTimeoutMs); err != nil {
		return FetchSettingsDTO{}, err
	}
	if err := s.writeFetchInt(settingFetchMetaTimeout, input.MetaTimeoutMs); err != nil {
		return FetchSettingsDTO{}, err
	}
	if err := s.writeFetchInt(settingFetchFaviconTimeout, input.FaviconTimeoutMs); err != nil {
		return FetchSettingsDTO{}, err
	}
	if err := s.writeFetchInt(settingFetchHealthTimeout, input.HealthTimeoutMs); err != nil {
		return FetchSettingsDTO{}, err
	}
	if err := s.writeFetchInt(settingFetchHTMLMaxBytes, input.HTMLMaxBytes); err != nil {
		return FetchSettingsDTO{}, err
	}
	if err := s.writeFetchInt(settingFetchIconMaxBytes, input.IconMaxBytes); err != nil {
		return FetchSettingsDTO{}, err
	}
	if err := s.writeFetchInt(settingFetchHealthWorkers, input.HealthConcurrency); err != nil {
		return FetchSettingsDTO{}, err
	}

	s.applyFetchSettings()
	return s.GetFetchSettings(), nil
}

func (s *Service) writeFetchString(key string, v *string) error {
	if v == nil {
		return nil
	}
	value := strings.TrimSpace(*v)
	if value == "" {
		return s.store.DeleteSetting(key)
	}
	return s.store.SetSetting(key, value)
}

func (s *Service) writeFetchInt(key string, v *int) error {
	if v == nil {
		return nil
	}
	if *v == 0 {
		return s.store.DeleteSetting(key)
	}
	return s.store.SetSetting(key, strconv.Itoa(*v))
}

func validateFetchSettings(input UpdateFetchSettingsInput) error {
	for name, v := range map[string]*string{
		"htmlUserAgent":   input.HTMLUserAgent,
		"iconUserAgent":   input.IconUserAgent,
		"healthUserAgent": input.HealthUserAgent,
	} {
		if v == nil {
			continue
		}
		value := strings.TrimSpace(*v)
		if value == "" {
			continue
		}
		if len([]rune(value)) > maxFetchUALength || strings.ContainsAny(value, "\r\n") {
			return fmt.Errorf("%s 需为单行且不超过 %d 个字符", name, maxFetchUALength)
		}
	}
	for name, v := range map[string]*int{
		"clientTimeoutMs":   input.ClientTimeoutMs,
		"metaTimeoutMs":     input.MetaTimeoutMs,
		"faviconTimeoutMs":  input.FaviconTimeoutMs,
		"healthTimeoutMs":   input.HealthTimeoutMs,
		"htmlMaxBytes":      input.HTMLMaxBytes,
		"iconMaxBytes":      input.IconMaxBytes,
		"healthConcurrency": input.HealthConcurrency,
	} {
		if v == nil || *v == 0 {
			continue
		}
		min, max := minFetchTimeoutMs, maxFetchTimeoutMs
		if name == "htmlMaxBytes" || name == "iconMaxBytes" {
			min, max = minFetchBytes, maxFetchBytes
		}
		if name == "healthConcurrency" {
			min, max = 1, maxFetchWorkers
		}
		if *v < min || *v > max {
			return fmt.Errorf("%s 取值范围 %d–%d", name, min, max)
		}
	}
	return nil
}
