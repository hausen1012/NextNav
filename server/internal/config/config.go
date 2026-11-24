package config

import (
	"os"
	"strings"
)

// Config holds runtime configuration read from environment variables.
type Config struct {
	Port          string
	DataDir       string
	CheckInterval string
	SecureCookie  bool
	CookieSecret  string
	AdminUsername string
	AdminPassword string
	SeedSample    bool
}

func Load() Config {
	return Config{
		Port:          env("PORT", "8787"),
		DataDir:       env("DATA_DIR", "./data"),
		CheckInterval: env("CHECK_INTERVAL", "1d"),
		SecureCookie:  envBool("COOKIE_SECURE", false),
		CookieSecret:  env("COOKIE_SECRET", ""),
		AdminUsername: env("ADMIN_USERNAME", "admin"),
		AdminPassword: env("ADMIN_PASSWORD", "admin123"),
		SeedSample:    envBool("SEED_SAMPLE", false),
	}
}

func env(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func envBool(key string, def bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	return v == "1" || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes")
}
