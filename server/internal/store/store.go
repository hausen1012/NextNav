package store

import (
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed all:migrations/*.sql
var migrationFS embed.FS

// Store wraps the SQLite connection plus the data directory layout.
type Store struct {
	DB      *sql.DB
	DataDir string
}

// Open creates the data directory, opens (or creates) the database, applies
// pending migrations and makes sure runtime secrets exist.
func Open(dataDir string) (*Store, error) {
	if err := os.MkdirAll(filepath.Join(dataDir, "icons"), 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "nextnav.db")
	dsn := "file:" + filepath.ToSlash(dbPath) +
		"?_pragma=foreign_keys(1)" +
		"&_pragma=journal_mode(WAL)" +
		"&_pragma=busy_timeout(5000)" +
		"&_pragma=synchronous(NORMAL)"

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	// Single writer keeps the app free of SQLITE_BUSY handling; the workload is tiny.
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}

	s := &Store{DB: db, DataDir: dataDir}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	if err := s.ensureSecrets(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.DB.Close() }

func (s *Store) migrate() error {
	var current int
	if err := s.DB.QueryRow("PRAGMA user_version").Scan(&current); err != nil {
		return fmt.Errorf("read user_version: %w", err)
	}

	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}

	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		prefix := strings.SplitN(name, "_", 2)[0]
		version, err := strconv.Atoi(prefix)
		if err != nil {
			return fmt.Errorf("bad migration filename %q", name)
		}
		if version <= current {
			continue
		}

		body, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}

		tx, err := s.DB.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(body)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err := tx.Exec(fmt.Sprintf("PRAGMA user_version = %d", version)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("set user_version: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		current = version
	}
	return nil
}

func (s *Store) ensureSecrets() error {
	var existing string
	err := s.DB.QueryRow(`SELECT value FROM setting WHERE key = 'secret.cookie_key'`).Scan(&existing)
	if err == nil && existing != "" {
		return nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read cookie key: %w", err)
	}

	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return err
	}
	_, err = s.DB.Exec(
		`INSERT INTO setting(key, value, updated_at) VALUES(?, ?, ?)`,
		"secret.cookie_key", hex.EncodeToString(buf), time.Now().UnixMilli(),
	)
	return err
}

// GetSetting returns the stored value or def when the key is absent.
func (s *Store) GetSetting(key, def string) string {
	var v string
	if err := s.DB.QueryRow(`SELECT value FROM setting WHERE key = ?`, key).Scan(&v); err != nil {
		return def
	}
	return v
}

// SetSetting upserts a setting row.
func (s *Store) SetSetting(key, value string) error {
	_, err := s.DB.Exec(
		`INSERT INTO setting(key, value, updated_at) VALUES(?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, time.Now().UnixMilli(),
	)
	return err
}

// AdminCount reports how many administrator rows exist (0 or 1).
func (s *Store) AdminCount() (int, error) {
	var n int
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM admin`).Scan(&n)
	return n, err
}
