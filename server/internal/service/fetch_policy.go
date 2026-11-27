package service

import (
	"net/netip"
	"time"
)

const (
	defaultHTMLMaxBytes     = 512 * 1024
	defaultIconMaxBytes     = 1024 * 1024
	defaultHealthDrainBytes = 512
)

const (
	defaultHTMLUserAgent   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	defaultIconUserAgent   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
	defaultHealthUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
	defaultHTMLAccept      = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
	defaultIconAccept      = "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
)

var (
	defaultFakeIPPrefix            = netip.MustParsePrefix("198.18.0.0/15")
	defaultBlockedOutboundPrefixes = []netip.Prefix{
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
)

// FetchPolicy 收敛服务端主动外联的超时、请求头、读取上限与出站安全规则。
type FetchPolicy struct {
	ClientTimeout           time.Duration
	DialTimeout             time.Duration
	KeepAlive               time.Duration
	TLSHandshakeTimeout     time.Duration
	ResponseHeaderTimeout   time.Duration
	MaxRedirects            int
	MetaTimeout             time.Duration
	FaviconTimeout          time.Duration
	HealthTimeout           time.Duration
	HealthMaxRedirects      int
	HealthConcurrency       int
	HealthDrainBytes        int64
	HTMLMaxBytes            int64
	IconMaxBytes            int64
	HTMLUserAgent           string
	IconUserAgent           string
	HealthUserAgent         string
	HTMLAccept              string
	IconAccept              string
	FakeIPPrefix            netip.Prefix
	BlockedOutboundPrefixes []netip.Prefix
}

func defaultFetchPolicy() FetchPolicy {
	return FetchPolicy{
		ClientTimeout:           4 * time.Second,
		DialTimeout:             5 * time.Second,
		KeepAlive:               30 * time.Second,
		TLSHandshakeTimeout:     5 * time.Second,
		ResponseHeaderTimeout:   5 * time.Second,
		MaxRedirects:            5,
		MetaTimeout:             3 * time.Second,
		FaviconTimeout:          8 * time.Second,
		HealthTimeout:           10 * time.Second,
		HealthMaxRedirects:      5,
		HealthConcurrency:       5,
		HealthDrainBytes:        defaultHealthDrainBytes,
		HTMLMaxBytes:            defaultHTMLMaxBytes,
		IconMaxBytes:            defaultIconMaxBytes,
		HTMLUserAgent:           defaultHTMLUserAgent,
		IconUserAgent:           defaultIconUserAgent,
		HealthUserAgent:         defaultHealthUserAgent,
		HTMLAccept:              defaultHTMLAccept,
		IconAccept:              defaultIconAccept,
		FakeIPPrefix:            defaultFakeIPPrefix,
		BlockedOutboundPrefixes: defaultBlockedOutboundPrefixes,
	}
}
