package store

import (
	"database/sql"
	"errors"
	"time"
)

// GetFaviconCache returns the cached icon path for a given domain, or ErrNotFound if not cached.
func (s *Store) GetFaviconCache(domain string) (string, error) {
	var iconPath string
	err := s.DB.QueryRow(`SELECT icon_path FROM favicon_cache WHERE domain = ?`, domain).Scan(&iconPath)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return iconPath, nil
}

// SetFaviconCache saves or updates a cached icon path for a domain.
func (s *Store) SetFaviconCache(domain, iconPath string) error {
	now := time.Now().UnixMilli()
	_, err := s.DB.Exec(
		`INSERT INTO favicon_cache(domain, icon_path, updated_at) VALUES(?, ?, ?)
		 ON CONFLICT(domain) DO UPDATE SET icon_path = excluded.icon_path, updated_at = excluded.updated_at`,
		domain, iconPath, now,
	)
	return err
}
