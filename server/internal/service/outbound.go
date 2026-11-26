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

var (
	errBlockedOutboundAddress = errors.New("outbound address is not public")
	dnsProxyFakeIPPrefix      = netip.MustParsePrefix("198.18.0.0/15")
)

var blockedOutboundPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("224.0.0.0/4"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("::/96"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("64:ff9b:1::/48"),
	netip.MustParsePrefix("100::/64"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2002::/16"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
	netip.MustParsePrefix("ff00::/8"),
}

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
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	return newSafeHTTPClientWith(timeout, net.DefaultResolver, dialer.DialContext)
}

func newSafeHTTPClientWith(timeout time.Duration, resolver outboundResolver, dial outboundDialFunc) *http.Client {
	transport := &http.Transport{
		Proxy:                 nil,
		DialContext:           safeOutboundDialContext(resolver, dial),
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 5 * time.Second,
	}
	return &http.Client{
		Timeout: timeout,
		Transport: safeOutboundTransport{
			base: transport,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
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

func safeOutboundDialContext(resolver outboundResolver, dial outboundDialFunc) func(context.Context, string, string) (net.Conn, error) {
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
			if !isAllowedOutboundIP(host, ipAddr.IP) {
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

func isAllowedOutboundIP(host string, ip net.IP) bool {
	if isPublicOutboundIP(ip) {
		return true
	}
	// 本地代理软件常用 198.18.0.0/15 作为域名 fake-ip，拨号由代理接管；
	// 仅允许域名解析结果，不允许 URL 直接写死该地址。
	return net.ParseIP(host) == nil && isFakeOutboundIP(ip)
}

func isFakeOutboundIP(ip net.IP) bool {
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	return dnsProxyFakeIPPrefix.Contains(addr.Unmap())
}

func isPublicOutboundIP(ip net.IP) bool {
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
	for _, prefix := range blockedOutboundPrefixes {
		if prefix.Contains(addr) {
			return false
		}
	}
	return true
}
