package service

import (
	"errors"
	"path/filepath"
	"strings"
)

func (s *Service) SaveLogo(data []byte, filename string) (string, error) {
	if len(data) > 1024*1024 {
		return "", ErrImageTooLarge
	}
	ext, err := DetectImageType(data, filename)
	if err != nil {
		return "", err
	}
	if ext != ".png" && ext != ".jpg" && ext != ".webp" {
		return "", errors.New("logo must be png, jpeg, or webp")
	}

	relPath, err := s.SaveIconContent(data, filename)
	if err != nil {
		return "", err
	}

	if err := s.store.SetSetting("site.logo_path", relPath); err != nil {
		return "", err
	}

	logoURL := "/" + strings.TrimPrefix(filepath.ToSlash(relPath), "/")
	return logoURL, nil
}

func (s *Service) RemoveLogo() error {
	return s.store.SetSetting("site.logo_path", "")
}
