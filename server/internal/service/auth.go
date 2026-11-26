package service

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"nextnav/internal/auth"
	"nextnav/internal/store"
)

func (s *Service) CookieKey() []byte {
	s.cookieKeyMu.RLock()
	defer s.cookieKeyMu.RUnlock()
	key := make([]byte, len(s.cookieKey))
	copy(key, s.cookieKey)
	return key
}

func (s *Service) setCookieKey(key []byte) {
	s.cookieKeyMu.Lock()
	defer s.cookieKeyMu.Unlock()
	s.cookieKey = key
}

func (s *Service) cookieKeyPath() string {
	return filepath.Join(s.store.DataDir, ".cookie_key")
}

func (s *Service) initCookieKey() {
	keyFile := s.cookieKeyPath()
	if data, err := os.ReadFile(keyFile); err == nil {
		if raw, err := hex.DecodeString(strings.TrimSpace(string(data))); err == nil && len(raw) == 32 {
			s.setCookieKey(raw)
			return
		}
	}

	// 历史兼容：如果旧数据库 setting 中留有密钥，迁移至独立受保护文件并从数据库中抹除
	if old := s.store.GetSetting("secret.cookie_key", ""); old != "" {
		if raw, err := hex.DecodeString(old); err == nil && len(raw) == 32 {
			s.setCookieKey(raw)
			if err := writeCookieKeyFile(keyFile, raw); err != nil {
				slog.Error("migrate cookie key failed", "err", err)
				return
			}
			_ = s.store.DeleteSetting("secret.cookie_key")
			return
		}
	}

	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		panic(fmt.Errorf("generate cookie key: %w", err))
	}
	if err := writeCookieKeyFile(keyFile, buf); err != nil {
		panic(fmt.Errorf("persist cookie key: %w", err))
	}
	s.setCookieKey(buf)
}

func (s *Service) rotateCookieKey() error {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return fmt.Errorf("generate cookie key: %w", err)
	}
	if err := writeCookieKeyFile(s.cookieKeyPath(), key); err != nil {
		return fmt.Errorf("persist cookie key: %w", err)
	}
	s.setCookieKey(key)
	return nil
}

func writeCookieKeyFile(path string, key []byte) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".cookie_key-*")
	if err != nil {
		return err
	}
	tempPath := file.Name()
	defer func() {
		_ = file.Close()
		_ = os.Remove(tempPath)
	}()

	if err := file.Chmod(0o600); err != nil {
		return err
	}
	if _, err := file.WriteString(hex.EncodeToString(key)); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(tempPath, path)
}

func (s *Service) InitAdmin(username, password string, seedSample bool) error {
	count, err := s.store.AdminCount()
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	username = strings.TrimSpace(username)
	if username == "" || len([]rune(username)) > 32 {
		return fmt.Errorf("admin username must be 1-32 characters, got %q", username)
	}
	if len(password) < 8 {
		return fmt.Errorf("admin password must be at least 8 characters")
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.store.CreateAdmin(username, hash); err != nil {
		return fmt.Errorf("create admin: %w", err)
	}

	if seedSample {
		if err := s.store.SeedSample(); err != nil {
			slog.Error("seed sample data", "err", err)
			return fmt.Errorf("seed sample data: %w", err)
		}
	}
	return nil
}

func (s *Service) Authenticate(username, password string) (string, bool) {
	adm, err := s.store.GetAdmin()
	if err != nil {
		return "", false
	}
	if strings.EqualFold(adm.Username, username) && auth.VerifyPassword(adm.PasswordHash, password) {
		return adm.Username, true
	}
	return "", false
}

func (s *Service) GetAdminUsername() string {
	adm, err := s.store.GetAdmin()
	if err != nil {
		return "admin"
	}
	return adm.Username
}

func (s *Service) VerifyToken(token string) bool {
	stored, err := s.store.GetTokenHash()
	if err != nil {
		return false
	}
	sum := sha256.Sum256([]byte(token))
	gotHex := hex.EncodeToString(sum[:])
	if subtle.ConstantTimeCompare([]byte(gotHex), []byte(stored)) != 1 {
		return false
	}
	_ = s.store.TouchToken()
	return true
}

func (s *Service) GetTokenInfo() (*store.TokenInfo, error) {
	return s.store.GetTokenInfo()
}

func (s *Service) GenerateToken() (string, *store.TokenInfo, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", nil, err
	}
	raw := "nn_" + hex.EncodeToString(buf)
	prefix := raw[:11]
	sum := sha256.Sum256([]byte(raw))
	tokenHash := hex.EncodeToString(sum[:])
	if err := s.store.SetToken(tokenHash, prefix); err != nil {
		return "", nil, err
	}
	info, err := s.store.GetTokenInfo()
	return raw, info, err
}

func (s *Service) RevokeToken() error {
	return s.store.DeleteToken()
}

func (s *Service) UpdateAccount(currentPassword, newUsername, newPassword string) (string, error) {
	adm, err := s.store.GetAdmin()
	if err != nil {
		return "", err
	}
	if !auth.VerifyPassword(adm.PasswordHash, currentPassword) {
		return "", ErrBadCredentials
	}

	user := adm.Username
	if strings.TrimSpace(newUsername) != "" {
		user = strings.TrimSpace(newUsername)
	}

	hash := adm.PasswordHash
	if newPassword != "" {
		h, err := auth.HashPassword(newPassword)
		if err != nil {
			return "", err
		}
		hash = h
	}

	var previousKey []byte
	if newPassword != "" {
		previousKey = s.CookieKey()
		if err := s.rotateCookieKey(); err != nil {
			return "", err
		}
	}

	if err := s.store.UpdateAdmin(user, hash); err != nil {
		if newPassword != "" {
			if restoreErr := writeCookieKeyFile(s.cookieKeyPath(), previousKey); restoreErr != nil {
				slog.Error("restore cookie key failed", "err", restoreErr)
			} else {
				s.setCookieKey(previousKey)
			}
		}
		return "", err
	}
	return user, nil
}
