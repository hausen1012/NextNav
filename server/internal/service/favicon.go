package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	ErrInvalidDomain   = errors.New("invalid domain")
	ErrFaviconNotFound = errors.New("favicon not found")
)

// CleanDomain normalizes a domain string, stripping protocols and paths.
func CleanDomain(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", ErrInvalidDomain
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
		u, err := url.Parse(s)
		if err != nil || u.Host == "" {
			return "", ErrInvalidDomain
		}
		s = u.Host
	} else if idx := strings.Index(s, "/"); idx != -1 {
		s = s[:idx]
	}
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" || strings.ContainsAny(s, " \t\r\n\\?#@") {
		return "", ErrInvalidDomain
	}
	return s, nil
}

// ExtractDomain extracts and cleans the domain hostname from a raw link URL.
func ExtractDomain(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	host := u.Hostname()
	dom, err := CleanDomain(host)
	if err != nil {
		return ""
	}
	return dom
}

// FormatFaviconURL formats a favicon service URL using the template and domain.
// Supports "{domain}" placeholder, or appends domain to prefix.
func FormatFaviconURL(template, domain string) string {
	template = strings.TrimSpace(template)
	domain = strings.TrimSpace(domain)
	if template == "" || domain == "" {
		return ""
	}
	if strings.Contains(template, "{domain}") {
		return strings.ReplaceAll(template, "{domain}", domain)
	}
	if strings.HasSuffix(template, "/") {
		return template + domain
	}
	return template + "/" + domain
}

// GetOrFetchFavicon retrieves a cached favicon or fetches it from the remote site.
func (s *Service) GetOrFetchFavicon(ctx context.Context, domain string) (string, error) {
	dom, err := CleanDomain(domain)
	if err != nil {
		return "", err
	}

	// 1. Check database cache
	if iconPath, err := s.store.GetFaviconCache(dom); err == nil && iconPath != "" {
		fullPath := filepath.Join(s.DataDir(), filepath.FromSlash(iconPath))
		if info, statErr := os.Stat(fullPath); statErr == nil && !info.IsDir() {
			return iconPath, nil
		}
	}

	// 2. Fetch from remote
	iconPath, err := s.fetchFaviconForDomain(ctx, dom)
	if err != nil {
		return "", err
	}

	// 3. Cache result
	_ = s.store.SetFaviconCache(dom, iconPath)
	return iconPath, nil
}

func (s *Service) fetchFaviconForDomain(ctx context.Context, dom string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	client := s.fetchClient
	schemes := []string{"https://", "http://"}
	for _, scheme := range schemes {
		targetURL := scheme + dom
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

		resp, err := client.Do(req)
		if err == nil {
			iconURL := extractIconURLFromResp(resp)
			resp.Body.Close()

			if iconURL != "" {
				if path, err := s.fetchAndSaveFavicon(ctx, iconURL); err == nil && path != "" {
					return path, nil
				}
			}
		}

		// Fallback directly to /favicon.ico
		directFavicon := scheme + dom + "/favicon.ico"
		if path, err := s.fetchAndSaveFavicon(ctx, directFavicon); err == nil && path != "" {
			return path, nil
		}
	}

	return "", ErrFaviconNotFound
}

func extractIconURLFromResp(resp *http.Response) string {
	if resp == nil || resp.Body == nil {
		return ""
	}
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	bodyStr := string(bodyBytes)

	iconHref := ""
	if match := iconRegex1.FindStringSubmatch(bodyStr); len(match) > 1 {
		iconHref = strings.TrimSpace(match[1])
	} else if match := iconRegex2.FindStringSubmatch(bodyStr); len(match) > 1 {
		iconHref = strings.TrimSpace(match[1])
	} else if match := appleIcon.FindStringSubmatch(bodyStr); len(match) > 1 {
		iconHref = strings.TrimSpace(match[1])
	}

	if iconHref != "" {
		if u, err := url.Parse(iconHref); err == nil {
			if resp.Request != nil && resp.Request.URL != nil {
				return resp.Request.URL.ResolveReference(u).String()
			}
		}
	}
	return ""
}
