package handler

import (
	"net/http"
	"net/url"
	"strings"

	"nextnav/internal/httpx"
)

type faviconAccessPolicy struct {
	allowAny   bool
	exact      map[string]struct{}
	subdomains []string
}

func newFaviconAccessPolicy(raw string) faviconAccessPolicy {
	policy := faviconAccessPolicy{exact: make(map[string]struct{})}
	for _, entry := range strings.Split(raw, ",") {
		domain := strings.ToLower(strings.TrimSpace(entry))
		if domain == "" {
			continue
		}
		if domain == "*" {
			policy.allowAny = true
			continue
		}

		wildcard := strings.HasPrefix(domain, "*.")
		if wildcard {
			domain = strings.TrimPrefix(domain, "*.")
		}
		domain = strings.TrimSuffix(domain, ".")
		if domain == "" || strings.HasPrefix(domain, ".") || strings.Contains(domain, "..") ||
			strings.ContainsAny(domain, " \t\r\n/\\?#@*") {
			continue
		}

		if wildcard {
			policy.subdomains = append(policy.subdomains, domain)
		} else {
			policy.exact[domain] = struct{}{}
		}
	}
	return policy
}

func (p faviconAccessPolicy) allowsHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(host), "."))
	if host == "" {
		return false
	}
	if p.allowAny {
		return true
	}
	if _, ok := p.exact[host]; ok {
		return true
	}
	for _, domain := range p.subdomains {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			return true
		}
	}
	return false
}

func (p faviconAccessPolicy) allowsRequest(r *http.Request) bool {
	if p.allowAny {
		return true
	}
	if referer := strings.TrimSpace(r.Header.Get("Referer")); referer != "" {
		return p.allowsURL(referer)
	}
	if origin := strings.TrimSpace(r.Header.Get("Origin")); origin != "" {
		return p.allowsURL(origin)
	}
	return strings.EqualFold(strings.TrimSpace(r.Header.Get("Sec-Fetch-Site")), "same-origin")
}

func (p faviconAccessPolicy) allowsURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || (!strings.EqualFold(u.Scheme, "http") && !strings.EqualFold(u.Scheme, "https")) {
		return false
	}
	return p.allowsHost(u.Hostname())
}

func (a *API) faviconAccess(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if isPrivateOrLocalIP(clientIP(r)) || a.faviconPolicy.allowsRequest(r) {
			w.Header().Add("Vary", "Referer")
			w.Header().Add("Vary", "Origin")
			w.Header().Add("Vary", "Sec-Fetch-Site")
			next(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		httpx.Fail(w, http.StatusForbidden, "forbidden", "Favicon 来源不被允许")
	}
}
