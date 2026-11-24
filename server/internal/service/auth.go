package service

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strings"

	"nextnav/internal/auth"
)

func (s *Service) CookieKey() []byte {
	v := s.store.GetSetting("secret.cookie_key", "")
	raw, err := hex.DecodeString(v)
	if err != nil || len(raw) != 32 {
		slog.Error("invalid cookie key, sessions will not persist")
		return []byte(v)
	}
	return raw
}

func (s *Service) GetSetupStatus() (bool, error) {
	count, err := s.store.AdminCount()
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) Setup(username, password string, seedSample bool) error {
	installed, err := s.GetSetupStatus()
	if err != nil {
		return err
	}
	if installed {
		return ErrAlreadyInstalled
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}

	if err := s.store.CreateAdmin(username, hash); err != nil {
		return err
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
