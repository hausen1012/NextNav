package store

import (
	"database/sql"
	"errors"
	"time"
)

// ErrNotFound indicates the queried record does not exist.
var ErrNotFound = errors.New("record not found")

// ErrDuplicate indicates a unique constraint violation.
var ErrDuplicate = errors.New("duplicate record")

// GetAdmin returns the administrator record, or ErrNotFound if no admin exists.
func (s *Store) GetAdmin() (*Admin, error) {
	var a Admin
	err := s.DB.QueryRow(`SELECT id, username, password_hash, created_at, updated_at FROM admin WHERE id = 1`).
		Scan(&a.ID, &a.Username, &a.PasswordHash, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// CreateAdmin inserts the initial administrator record.
func (s *Store) CreateAdmin(username, passwordHash string) error {
	now := time.Now().UnixMilli()
	_, err := s.DB.Exec(
		`INSERT INTO admin(id, username, password_hash, created_at, updated_at) VALUES(1, ?, ?, ?, ?)`,
		username, passwordHash, now, now,
	)
	return err
}

// UpdateAdmin updates the administrator credentials.
func (s *Store) UpdateAdmin(username, passwordHash string) error {
	now := time.Now().UnixMilli()
	_, err := s.DB.Exec(
		`UPDATE admin SET username = ?, password_hash = ?, updated_at = ? WHERE id = 1`,
		username, passwordHash, now,
	)
	return err
}

// TokenInfo stores public metadata about the configured API token.
type TokenInfo struct {
	Prefix     string `json:"prefix"`
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt *int64 `json:"lastUsedAt"`
}

// GetTokenInfo returns the current API token metadata.
func (s *Store) GetTokenInfo() (*TokenInfo, error) {
	var (
		prefix    string
		createdAt int64
		lastUsed  sql.NullInt64
	)
	err := s.DB.QueryRow(`SELECT prefix, created_at, last_used_at FROM api_token WHERE id = 1`).
		Scan(&prefix, &createdAt, &lastUsed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	info := &TokenInfo{
		Prefix:    prefix,
		CreatedAt: createdAt,
	}
	if lastUsed.Valid {
		info.LastUsedAt = &lastUsed.Int64
	}
	return info, nil
}

// SetToken stores a new API token hash and prefix.
func (s *Store) SetToken(tokenHash, prefix string) error {
	now := time.Now().UnixMilli()
	_, err := s.DB.Exec(
		`INSERT INTO api_token(id, token_hash, prefix, created_at, last_used_at)
		 VALUES(1, ?, ?, ?, NULL)
		 ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, prefix = excluded.prefix, created_at = excluded.created_at, last_used_at = NULL`,
		tokenHash, prefix, now,
	)
	return err
}

// DeleteToken removes the API token.
func (s *Store) DeleteToken() error {
	_, err := s.DB.Exec(`DELETE FROM api_token WHERE id = 1`)
	return err
}

// GetTokenHash returns the stored API token hash.
func (s *Store) GetTokenHash() (string, error) {
	var stored string
	err := s.DB.QueryRow(`SELECT token_hash FROM api_token WHERE id = 1`).Scan(&stored)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return stored, err
}

// TouchToken updates the last used timestamp for the API token.
func (s *Store) TouchToken() error {
	_, err := s.DB.Exec(`UPDATE api_token SET last_used_at = ? WHERE id = 1`, time.Now().UnixMilli())
	return err
}
