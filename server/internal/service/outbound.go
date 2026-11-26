package service

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

var errBlockedOutboundAddress = errors.New("outbound address is not public")

type outboundResolver interface {
	LookupIPAddr(context.Context, string) ([]net.IPAddr, error)
}

type outboundDialFunc func(context.Context, string, string) (net.Conn, error)

type safeOutboundTransport struct {
	base http.RoundTripper
}

func (t safeOutboundTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if err := validateOutboundURL(req.URL); err != nil {
		return nil, err
	}
	return t.base.RoundTrip(req)
}

func newSafeHTTPClient(timeout time.Duration) *http.Client {
	policy := defaultFetchPolicy()
	policy.ClientTimeout = timeout
	return newSafeHTTPClientForPolicy(policy)
}

func newSafeHTTPClientForPolicy(policy FetchPolicy) *http.Client {
	dialer := &net.Dialer{Timeout: policy.DialTimeout, KeepAlive: policy.KeepAlive}
	return newSafeHTTPClientWithPolicy(policy, net.DefaultResolver, dialer.DialContext)
}

func newSafeHTTPClientWith(timeout time.Duration, resolver outboundResolver, dial outboundDialFunc) *http.Client {
	policy := defaultFetchPolicy()
	policy.ClientTimeout = timeout
	return newSafeHTTPClientWithPolicy(policy, resolver, dial)
}

func newSafeHTTPClientWithPolicy(policy FetchPolicy, resolver outboundResolver, dial outboundDialFunc) *http.Client {
	transport := &http.Transport{
		Proxy:                 nil,
		DialContext:           safeOutboundDialContextWithPolicy(resolver, dial, policy),
		TLSHandshakeTimeout:   policy.TLSHandshakeTimeout,
		ResponseHeaderTimeout: policy.ResponseHeaderTimeout,
	}
	return &http.Client{
		Timeout: policy.ClientTimeout,
		Transport: safeOutboundTransport{
			base: transport,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= policy.MaxRedirects {
				return errors.New("too many redirects")
			}
			return validateOutboundURL(req.URL)
		},
	}
}

func validateOutboundURL(u *url.URL) error {
	if u == nil || u.Opaque != "" || u.Hostname() == "" {
		return errBlockedOutboundAddress
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return errBlockedOutboundAddress
	}
	return nil
}

func safeOutboundDialContextWithPolicy(resolver outboundResolver, dial outboundDialFunc, policy FetchPolicy) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}

		ips, err := resolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}

		var lastErr error
		for _, ipAddr := range ips {
			if !isAllowedOutboundIP(host, ipAddr.IP, policy) {
				continue
			}
			conn, dialErr := dial(ctx, network, net.JoinHostPort(ipAddr.IP.String(), port))
			if dialErr == nil {
				return conn, nil
			}
			lastErr = dialErr
		}
		if lastErr != nil {
			return nil, lastErr
		}
		return nil, errBlockedOutboundAddress
	}
}

func isAllowedOutboundIP(host string, ip net.IP, policy FetchPolicy) bool {
	if isPublicOutboundIPWithPolicy(ip, policy) {
		return true
	}
	// 本地代理软件常用 fake-ip 段作为域名解析结果，拨号由代理接管；
	// 仅允许域名解析结果，不允许 URL 直接写死该地址。
	return net.ParseIP(host) == nil && isFakeOutboundIPWithPolicy(ip, policy)
}

func isFakeOutboundIPWithPolicy(ip net.IP, policy FetchPolicy) bool {
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	return policy.FakeIPPrefix.Contains(addr.Unmap())
}

func isPublicOutboundIP(ip net.IP) bool {
	return isPublicOutboundIPWithPolicy(ip, defaultFetchPolicy())
}

func isPublicOutboundIPWithPolicy(ip net.IP, policy FetchPolicy) bool {
	if ip == nil {
		return false
	}
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	addr = addr.Unmap()
	if !addr.IsValid() || !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() ||
		addr.IsLinkLocalUnicast() || addr.IsMulticast() {
		return false
	}
	for _, prefix := range policy.BlockedOutboundPrefixes {
		if prefix.Contains(addr) {
			return false
		}
	}
	return true
}
