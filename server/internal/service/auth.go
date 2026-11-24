package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"nextnav/internal/auth"
)

func (s *Service) CookieKey() []byte {
	return s.cookieKey
}

func (s *Service) initCookieKey(customSecret string) {
	if sec := strings.TrimSpace(customSecret); sec != "" {
		if raw, err := hex.DecodeString(sec); err == nil && len(raw) == 32 {
			s.cookieKey = raw
			return
		}
		sum := sha256.Sum256([]byte(sec))
		s.cookieKey = sum[:]
		return
	}

	keyFile := filepath.Join(s.store.DataDir, ".cookie_key")
	if data, err := os.ReadFile(keyFile); err == nil {
		if raw, err := hex.DecodeString(strings.TrimSpace(string(data))); err == nil && len(raw) == 32 {
			s.cookieKey = raw
			return
		}
	}

	// 历史兼容：如果旧数据库 setting 中留有密钥，迁移至独立受保护文件并从数据库中抹除
	if old := s.store.GetSetting("secret.cookie_key", ""); old != "" {
		if raw, err := hex.DecodeString(old); err == nil && len(raw) == 32 {
			s.cookieKey = raw
			_ = os.WriteFile(keyFile, []byte(old), 0o600)
			_ = s.store.DeleteSetting("secret.cookie_key")
			return
		}
	}

	// 全新生成 32 字节高强度随机数，存储在数据目录下的受保护文件中（0600 权限）
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		slog.Error("generate cookie key failed", "err", err)
		s.cookieKey = []byte("nextnav-cookie-fallback-key-32b!")
		return
	}
	s.cookieKey = buf
	_ = os.WriteFile(keyFile, []byte(hex.EncodeToString(buf)), 0o600)
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
	if !constantTimeEqualHex(hex.EncodeToString(sum[:]), stored) {
		return false
	}
	_ = s.store.TouchToken()
	return true
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

	if err := s.store.UpdateAdmin(user, hash); err != nil {
		return "", err
	}
	return user, nil
}

func constantTimeEqualHex(got, want string) bool {
	if len(got) != len(want) {
		return false
	}
	var v byte
	for i := 0; i < len(got); i++ {
		v |= got[i] ^ want[i]
	}
	return v == 0
}
