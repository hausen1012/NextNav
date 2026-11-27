package service

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"nextnav/internal/slogx"
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
		slogx.Warn("获取网站信息失败: 无效的URL", "url", rawURL)
		return nil, errors.New("invalid url")
	}

	res := &MetaResult{
		ResolvedURL: rawURL,
		Host:        hostOf(rawURL),
	}

	policy, client := s.fetchRuntime()
	ctx, cancel := context.WithTimeout(context.Background(), policy.MetaTimeout)
	defer cancel()

	req, err := newFetchRequest(ctx, http.MethodGet, rawURL, policy.HTMLUserAgent, policy.HTMLAccept)
	if err != nil {
		slogx.Warn("获取网站信息失败: 创建请求失败", "url", rawURL, "err", err)
		return res, nil
	}

	resp, err := client.Do(req)
	if err != nil {
		slogx.Warn("获取网站信息失败: 请求连接异常", "url", rawURL, "err", err)
		return res, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		slogx.Warn("获取网站信息警告: 响应状态码异常", "url", rawURL, "status", resp.StatusCode)
	}

	if resp.Request != nil && resp.Request.URL != nil {
		res.ResolvedURL = resp.Request.URL.String()
		res.Host = hostOf(res.ResolvedURL)
	}

	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, policy.HTMLMaxBytes))
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
	iconHref := extractIconHref(bodyStr)

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
		if err != nil {
			slogx.Warn("获取网站信息警告: 获取网页图标失败", "url", rawURL, "iconUrl", iconAbsURL, "err", err)
		} else if iconPath != "" {
			res.IconPath = &iconPath
			u := "/" + iconPath
			res.IconURL = &u
		}
	}

	return res, nil
}

func (s *Service) fetchAndSaveFavicon(ctx context.Context, favURL string) (string, error) {
	policy, client := s.fetchRuntime()
	req, err := newFetchRequest(ctx, http.MethodGet, favURL, policy.IconUserAgent, policy.IconAccept)
	if err != nil {
		return "", err
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("icon status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, policy.IconMaxBytes))
	if err != nil || len(data) == 0 {
		if err == nil {
			err = errors.New("empty icon data")
		}
		return "", err
	}

	return s.SaveIconContent(data, favURL)
}
