package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var (
	ErrInvalidImageType = errors.New("invalid image type")
	ErrImageTooLarge    = errors.New("image exceeds 1MB limit")
)

// DetectImageType checks magic bytes or content type and returns canonical extension (.png, .jpg, .webp, .ico).
// Explicitly rejects SVG for security.
func DetectImageType(data []byte, filename string) (string, error) {
	if len(data) == 0 {
		return "", ErrInvalidImageType
	}

	// 1. Magic numbers
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if len(data) >= 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
		return ".png", nil
	}
	// JPEG: FF D8 FF
	if len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return ".jpg", nil
	}
	// WEBP: RIFF....WEBP
	if len(data) >= 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return ".webp", nil
	}
	// ICO: 00 00 01 00
	if len(data) >= 4 && data[0] == 0x00 && data[1] == 0x00 && data[2] == 0x01 && data[3] == 0x00 {
		return ".ico", nil
	}

	// 2. MIME sniffing
	ct := http.DetectContentType(data)
	if strings.Contains(ct, "png") {
		return ".png", nil
	}
	if strings.Contains(ct, "jpeg") {
		return ".jpg", nil
	}
	if strings.Contains(ct, "webp") {
		return ".webp", nil
	}
	if strings.Contains(ct, "x-icon") || strings.Contains(ct, "vnd.microsoft.icon") {
		return ".ico", nil
	}

	// 3. Fallback to extension check
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".ico" || ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" {
		if ext == ".jpeg" {
			ext = ".jpg"
		}
		return ext, nil
	}

	return "", ErrInvalidImageType
}

// SaveIconContent stores image data under icons/ab/cd/abcdef0123456789.<ext>
func (s *Service) SaveIconContent(data []byte, filename string) (string, error) {
	if len(data) > 1024*1024 {
		return "", ErrImageTooLarge
	}
	ext, err := DetectImageType(data, filename)
	if err != nil {
		return "", err
	}

	sum := sha256.Sum256(data)
	hashStr := hex.EncodeToString(sum[:])
	p1 := hashStr[:2]
	p2 := hashStr[2:4]
	fn := hashStr[:16] + ext

	dir := filepath.Join(s.DataDir(), "icons", p1, p2)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("mkdir icon dir: %w", err)
	}

	fullPath := filepath.Join(dir, fn)
	if err := os.WriteFile(fullPath, data, 0o644); err != nil {
		return "", fmt.Errorf("write icon: %w", err)
	}

	relPath := filepath.ToSlash(filepath.Join("icons", p1, p2, fn))
	return relPath, nil
}
