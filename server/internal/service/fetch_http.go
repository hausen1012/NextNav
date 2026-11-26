package service

import (
	"context"
	"net/http"
	"strings"
)

func newFetchRequest(ctx context.Context, method, rawURL, userAgent, accept string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, rawURL, nil)
	if err != nil {
		return nil, err
	}
	if userAgent != "" {
		req.Header.Set("User-Agent", userAgent)
	}
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	return req, nil
}

func extractIconHref(bodyStr string) string {
	if match := iconRegex1.FindStringSubmatch(bodyStr); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	if match := iconRegex2.FindStringSubmatch(bodyStr); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	if match := appleIcon.FindStringSubmatch(bodyStr); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return ""
}
