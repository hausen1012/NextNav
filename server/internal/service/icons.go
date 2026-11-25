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

	"nextnav/internal/slogx"
	"nextnav/internal/store"
)

var (
	ErrInvalidImageType = errors.New("invalid image type")
	ErrImageTooLarge    = errors.New("image exceeds 1MB limit")
)

const (
	iconSourceUpload = "upload"
	iconSourceFetch  = "fetched"
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

// iconFilePath resolves a stored icon path to an absolute path inside data/icons.
// It returns ok=false for anything that is not a plain path under icons/.
func (s *Service) iconFilePath(relPath string) (string, bool) {
	relPath = strings.TrimSpace(filepath.ToSlash(relPath))
	if relPath == "" || strings.Contains(relPath, "..") || !strings.HasPrefix(relPath, "icons/") {
		return "", false
	}
	full := filepath.Join(s.DataDir(), filepath.FromSlash(relPath))
	return full, true
}

// isURLOrWebPath checks if the given raw icon string is an external URL, data URL or API endpoint.
func isURLOrWebPath(s string) bool {
	return strings.HasPrefix(s, "http://") ||
		strings.HasPrefix(s, "https://") ||
		strings.HasPrefix(s, "data:") ||
		strings.HasPrefix(s, "/api/") ||
		strings.HasPrefix(s, "/")
}

// resolveStoredIcon validates an incoming icon path. Empty (or nil) clears the
// icon; otherwise it can be an external URL, API path, or an existing file inside data/icons.
// It returns the normalized path/URL.
func (s *Service) resolveStoredIcon(raw *string) (*string, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	v := strings.TrimSpace(*raw)
	if isURLOrWebPath(v) {
		return &v, nil
	}
	full, ok := s.iconFilePath(v)
	if !ok {
		return nil, ErrInvalidIconPath
	}
	if info, err := os.Stat(full); err != nil || info.IsDir() {
		return nil, ErrInvalidIconPath
	}
	p := filepath.ToSlash(v)
	return &p, nil
}

// SetLinkIcon points a link at a stored icon file, or clears it when iconPath
// is nil. Arbitrary values are rejected so the database cannot reference files
// outside the icon store.
func (s *Service) SetLinkIcon(linkID int64, iconPath *string) (*LinkDTO, error) {
	return s.applyLinkIcon(linkID, iconPath, iconSourceUpload)
}

// applyLinkIcon writes the icon and recycles the previous file when it is no
// longer referenced.
func (s *Service) applyLinkIcon(linkID int64, iconPath *string, source string) (*LinkDTO, error) {
	cur, err := s.store.GetLink(linkID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	newPath, err := s.resolveStoredIcon(iconPath)
	if err != nil {
		return nil, err
	}

	var src *string
	if newPath != nil {
		src = &source
	}
	if err := s.store.SetLinkIcon(linkID, newPath, src); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if cur.IconPath != nil && (newPath == nil || *newPath != *cur.IconPath) {
		s.CleanupIconIfUnreferenced(*cur.IconPath)
	}
	return s.GetLinkDTO(linkID)
}

// SaveLinkIconUpload stores an uploaded icon and attaches it to the link.
func (s *Service) SaveLinkIconUpload(linkID int64, data []byte, filename string) (*LinkDTO, error) {
	relPath, err := s.SaveIconContent(data, filename)
	if err != nil {
		return nil, err
	}
	return s.applyLinkIcon(linkID, &relPath, iconSourceUpload)
}

// CleanupIconIfUnreferenced removes the icon file when no link, category or
// site logo points at it any more.
func (s *Service) CleanupIconIfUnreferenced(relPath string) {
	if strings.TrimSpace(relPath) == "" {
		return
	}
	if !strings.HasPrefix(filepath.ToSlash(relPath), "icons/") {
		return
	}
	n, err := s.store.CountIconReferences(relPath)
	if err != nil || n > 0 {
		return
	}
	s.removeIconFile(relPath)
}

func (s *Service) removeIconFile(relPath string) {
	full, ok := s.iconFilePath(relPath)
	if !ok {
		return
	}
	if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
		slogx.Warn("remove icon file", "path", relPath, "err", err)
	}
}

// PurgeOrphanIcons deletes icon files that no row references and returns how
// many were removed.
func (s *Service) PurgeOrphanIcons() (int, error) {
	referenced, err := s.store.ListIconPaths()
	if err != nil {
		return 0, err
	}
	keep := make(map[string]struct{}, len(referenced))
	for _, p := range referenced {
		keep[filepath.ToSlash(filepath.Clean(p))] = struct{}{}
	}

	base := filepath.Join(s.DataDir(), "icons")
	var removed int
	err = filepath.WalkDir(base, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			if os.IsNotExist(walkErr) {
				return nil
			}
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(s.DataDir(), path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if _, ok := keep[rel]; ok {
			return nil
		}
		if err := os.Remove(path); err != nil {
			slogx.Warn("purge icon file", "path", rel, "err", err)
			return nil
		}
		removed++
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return removed, err
	}
	return removed, nil
}

func strPtr(s string) *string { return &s }
