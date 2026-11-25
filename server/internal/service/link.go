package service

import (
	"errors"
	"net/url"
	"strings"

	"nextnav/internal/store"
)

type CreateLinkInput struct {
	CategoryID  int64
	Title       string
	URL         string
	BackupURL   *string
	Description *string
	IconPath    *string
	IconURL     *string
	Sort        *int64
	IsPrivate   *bool
}

type UpdateLinkInput struct {
	CategoryID  *int64
	Title       *string
	URL         *string
	BackupURL   *string
	Description *string
	IconPath    *string
	IconURL     *string
	Sort        *int64
	IsPrivate   *bool
}

func cleanIconURL(raw *string) *string {
	if raw == nil {
		return nil
	}
	v := strings.TrimSpace(*raw)
	if v == "" {
		return nil
	}
	return &v
}

func (s *Service) GetLinkDTO(id int64) (*LinkDTO, error) {
	l, err := s.store.GetLink(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return s.toLinkDTO(l)
}

func (s *Service) CreateLink(input CreateLinkInput) (*LinkDTO, error) {
	cat, err := s.store.GetCategory(input.CategoryID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	dup, err := s.store.CategoryHasDuplicateLink(input.CategoryID, input.URL)
	if err != nil {
		return nil, err
	}
	if dup {
		return nil, ErrDuplicateLink
	}

	var sortVal int64 = 10
	if input.Sort != nil {
		sortVal = *input.Sort
	}

	descStr := ""
	if input.Description != nil {
		descStr = *input.Description
	}
	priv := false
	if input.IsPrivate != nil {
		priv = *input.IsPrivate
	}

	host := hostOf(input.URL)
	titleNorm := normalizeTitle(input.Title)
	searchText := buildSearchText(titleNorm, host, descStr, cat.Name)

	iconPath, err := s.resolveStoredIcon(input.IconPath)
	if err != nil {
		return nil, err
	}
	var iconSource *string
	if iconPath != nil {
		iconSource = strPtr(iconSourceFetch)
	}

	l := &store.Link{
		CategoryID:  input.CategoryID,
		Title:       input.Title,
		URL:         input.URL,
		BackupURL:   input.BackupURL,
		Description: input.Description,
		IconPath:    iconPath,
		IconSource:  iconSource,
		IconURL:     cleanIconURL(input.IconURL),
		Sort:        sortVal,
		IsPrivate:   priv,
		LastStatus:  "unknown",
		TitleNorm:   titleNorm,
		Host:        host,
		SearchText:  searchText,
	}

	id, err := s.store.CreateLink(l)
	if err != nil {
		if errors.Is(err, store.ErrDuplicate) {
			return nil, ErrDuplicateLink
		}
		return nil, err
	}
	return s.GetLinkDTO(id)
}

func (s *Service) UpdateLink(id int64, input UpdateLinkInput) (*LinkDTO, error) {
	cur, err := s.store.GetLink(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	catID := cur.CategoryID
	if input.CategoryID != nil {
		exists, err := s.store.CategoryExists(*input.CategoryID)
		if err != nil || !exists {
			return nil, ErrNotFound
		}
		catID = *input.CategoryID
	}

	cat, err := s.store.GetCategory(catID)
	if err != nil {
		return nil, err
	}

	title := cur.Title
	if input.Title != nil {
		title = strings.TrimSpace(*input.Title)
	}

	linkURL := cur.URL
	if input.URL != nil {
		linkURL = strings.TrimSpace(*input.URL)
	}

	desc := cur.Description
	if input.Description != nil {
		desc = input.Description
	}

	backupURL := cur.BackupURL
	if input.BackupURL != nil {
		backupURL = input.BackupURL
	}

	priv := cur.IsPrivate
	if input.IsPrivate != nil {
		priv = *input.IsPrivate
	}

	sortVal := cur.Sort
	if input.Sort != nil {
		sortVal = *input.Sort
	}

	descStr := ""
	if desc != nil {
		descStr = *desc
	}
	host := hostOf(linkURL)
	titleNorm := normalizeTitle(title)
	searchText := buildSearchText(titleNorm, host, descStr, cat.Name)

	iconPath := cur.IconPath
	iconSource := cur.IconSource
	if input.IconPath != nil {
		nextPath, err := s.resolveStoredIcon(input.IconPath)
		if err != nil {
			return nil, err
		}
		iconPath = nextPath
		iconSource = nil
		if nextPath != nil {
			iconSource = strPtr(iconSourceFetch)
		}
	}

	iconURL := cur.IconURL
	if input.IconURL != nil {
		iconURL = cleanIconURL(input.IconURL)
	}

	l := &store.Link{
		ID:          id,
		CategoryID:  catID,
		Title:       title,
		URL:         linkURL,
		BackupURL:   backupURL,
		Description: desc,
		IconPath:    iconPath,
		IconSource:  iconSource,
		IconURL:     iconURL,
		Sort:        sortVal,
		IsPrivate:   priv,
		TitleNorm:   titleNorm,
		Host:        host,
		SearchText:  searchText,
	}

	if err := s.store.UpdateLink(l); err != nil {
		if errors.Is(err, store.ErrDuplicate) {
			return nil, ErrDuplicateLink
		}
		return nil, err
	}
	if input.IconPath != nil && cur.IconPath != nil && *cur.IconPath != "" &&
		(iconPath == nil || *iconPath != *cur.IconPath) {
		s.CleanupIconIfUnreferenced(*cur.IconPath)
	}
	return s.GetLinkDTO(id)
}

func (s *Service) DeleteLink(id int64) error {
	l, err := s.store.GetLink(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	if err := s.store.DeleteLink(id); err != nil {
		return err
	}
	if l.IconPath != nil {
		s.CleanupIconIfUnreferenced(*l.IconPath)
	}
	return nil
}

func (s *Service) toLinkDTO(l *store.Link) (*LinkDTO, error) {
	catName := ""
	if cat, err := s.store.GetCategory(l.CategoryID); err == nil {
		catName = cat.Name
	}

	faviconService := s.store.GetSetting("site.favicon_service_url", "")
	finalIconURL := s.resolveDisplayIconURL(l.IconPath, l.IconURL, l.URL, faviconService)

	return &LinkDTO{
		ID:            l.ID,
		Title:         l.Title,
		URL:           l.URL,
		BackupURL:     l.BackupURL,
		Description:   l.Description,
		IconURL:       finalIconURL,
		IconPath:      l.IconPath,
		CustomIconURL: l.IconURL,
		CategoryID:    l.CategoryID,
		CategoryName:  catName,
		IsPrivate:     l.IsPrivate,
		Status:        l.LastStatus,
		Sort:          l.Sort,
		LastCheckedAt: l.LastCheckedAt,
	}, nil
}

func (s *Service) BatchDeleteLinks(ids []int64) (int64, error) {
	icons := make([]string, 0, len(ids))
	for _, id := range ids {
		if l, err := s.store.GetLink(id); err == nil && l.IconPath != nil {
			icons = append(icons, *l.IconPath)
		}
	}
	n, err := s.store.BatchDeleteLinks(ids)
	if err != nil {
		return n, err
	}
	for _, p := range icons {
		s.CleanupIconIfUnreferenced(p)
	}
	return n, nil
}

func (s *Service) BatchMoveLinks(ids []int64, targetCategoryID int64) (int64, error) {
	if _, err := s.store.GetCategory(targetCategoryID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return 0, ErrNotFound
		}
		return 0, err
	}
	n, err := s.store.BatchMoveLinks(ids, targetCategoryID)
	if err != nil {
		if errors.Is(err, store.ErrDuplicate) {
			return 0, ErrDuplicateLink
		}
		return 0, err
	}
	return n, nil
}

func normalizeTitle(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

func hostOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	h := strings.ToLower(u.Hostname())
	return strings.TrimPrefix(h, "www.")
}

func buildSearchText(parts ...string) string {
	var b strings.Builder
	for _, p := range parts {
		p = strings.ToLower(strings.TrimSpace(p))
		if p == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(p)
	}
	return b.String()
}
