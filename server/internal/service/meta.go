package service

import (
	"context"
	"errors"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type MetaResult struct {
	ResolvedURL string  `json:"resolvedUrl"`
	Host        string  `json:"host"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	IconURL     *string `json:"iconUrl,omitempty"`
	IconPath    *string `json:"iconPath,omitempty"`
}

var (
	titleRegex = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	descRegex1 = regexp.MustCompile(`(?is)<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']`)
	descRegex2 = regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']`)
	iconRegex1 = regexp.MustCompile(`(?is)<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]+href=["']([^"']*)["']`)
	iconRegex2 = regexp.MustCompile(`(?is)<link[^>]+href=["']([^"']*)["'][^>]+rel=["'](?:shortcut\s+)?icon["']`)
	appleIcon  = regexp.MustCompile(`(?is)<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]+href=["']([^"']*)["']`)
)

func (s *Service) FetchMeta(rawURL string) (*MetaResult, error) {
	rawURL = strings.TrimSpace(rawURL)
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return nil, errors.New("invalid url")
	}

	res := &MetaResult{
		ResolvedURL: rawURL,
		Host:        hostOf(rawURL),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	client := s.fetchClient
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return res, nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return res, nil
	}
	defer resp.Body.Close()

	if resp.Request != nil && resp.Request.URL != nil {
		res.ResolvedURL = resp.Request.URL.String()
		res.Host = hostOf(res.ResolvedURL)
	}

	// Limit read to 512 KB
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	bodyStr := string(bodyBytes)

	// 1. Extract Title
	if match := titleRegex.FindStringSubmatch(bodyStr); len(match) > 1 {
		res.Title = strings.TrimSpace(html.UnescapeString(match[1]))
	}

	// 2. Extract Description
	if match := descRegex1.FindStringSubmatch(bodyStr); len(match) > 1 {
		res.Description = strings.TrimSpace(html.UnescapeString(match[1]))
	} else if match := descRegex2.FindStringSubmatch(bodyStr); len(match) > 1 {
		res.Description = strings.TrimSpace(html.UnescapeString(match[1]))
	}

	// 3. Extract and fetch Favicon
	iconHref := ""
	if match := iconRegex1.FindStringSubmatch(bodyStr); len(match) > 1 {
		iconHref = strings.TrimSpace(match[1])
	} else if match := iconRegex2.FindStringSubmatch(bodyStr); len(match) > 1 {
		iconHref = strings.TrimSpace(match[1])
	} else if match := appleIcon.FindStringSubmatch(bodyStr); len(match) > 1 {
		iconHref = strings.TrimSpace(match[1])
	}

	var iconAbsURL string
	if iconHref != "" {
		if u, err := url.Parse(iconHref); err == nil {
			if resp.Request != nil && resp.Request.URL != nil {
				iconAbsURL = resp.Request.URL.ResolveReference(u).String()
			}
		}
	}
	if iconAbsURL == "" && resp.Request != nil && resp.Request.URL != nil {
		iconAbsURL = resp.Request.URL.Scheme + "://" + resp.Request.URL.Host + "/favicon.ico"
	}

	if iconAbsURL != "" {
		iconPath, err := s.fetchAndSaveFavicon(ctx, iconAbsURL)
		if err == nil && iconPath != "" {
			res.IconPath = &iconPath
			u := "/" + iconPath
			res.IconURL = &u
		}
	}

	return res, nil
}

func (s *Service) fetchAndSaveFavicon(ctx context.Context, favURL string) (string, error) {
	client := s.fetchClient
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, favURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", errors.New("icon status not ok")
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if err != nil || len(data) == 0 {
		return "", err
	}

	return s.SaveIconContent(data, favURL)
}
