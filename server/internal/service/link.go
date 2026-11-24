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
	Sort        *int64
	IsPrivate   *bool
}

type UpdateLinkInput struct {
	CategoryID  *int64
	Title       *string
	URL         *string
	BackupURL   *string
	Description *string
	Sort        *int64
	IsPrivate   *bool
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

	var sortVal int64
	if input.Sort != nil {
		sortVal = *input.Sort
	} else {
		maxSort, err := s.store.GetLinkMaxSort(input.CategoryID)
		if err != nil {
			return nil, err
		}
		sortVal = maxSort + 1000
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

	l := &store.Link{
		CategoryID:  input.CategoryID,
		Title:       input.Title,
		URL:         input.URL,
		BackupURL:   input.BackupURL,
		Description: input.Description,
		Sort:        sortVal,
		IsPrivate:   priv,
		LastStatus:  "unknown",
		TitleNorm:   titleNorm,
		Host:        host,
		SearchText:  searchText,
	}

	id, err := s.store.CreateLink(l)
	if err != nil {
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

	l := &store.Link{
		ID:          id,
		CategoryID:  catID,
		Title:       title,
		URL:         linkURL,
		BackupURL:   backupURL,
		Description: desc,
		IconPath:    cur.IconPath,
		IconSource:  cur.IconSource,
		Sort:        sortVal,
		IsPrivate:   priv,
		TitleNorm:   titleNorm,
		Host:        host,
		SearchText:  searchText,
	}

	if err := s.store.UpdateLink(l); err != nil {
		return nil, err
	}
	return s.GetLinkDTO(id)
}

func (s *Service) DeleteLink(id int64) error {
	return s.store.DeleteLink(id)
}

func (s *Service) ReorderLinks(categoryID int64, orderedIDs []int64) error {
	existing, err := s.store.ListLinkIDsByCategory(categoryID)
	if err != nil {
		return err
	}
	if len(existing) != len(orderedIDs) {
		return ErrInvalidReorder
	}

	seen := map[int64]bool{}
	for _, id := range orderedIDs {
		seen[id] = true
	}
	for _, id := range existing {
		if !seen[id] {
			return ErrInvalidReorder
		}
	}

	return s.store.ReorderLinks(categoryID, orderedIDs)
}

func (s *Service) toLinkDTO(l *store.Link) (*LinkDTO, error) {
	catName := ""
	if cat, err := s.store.GetCategory(l.CategoryID); err == nil {
		catName = cat.Name
	}

	iconStr := ""
	if l.IconPath != nil {
		iconStr = *l.IconPath
	}

	return &LinkDTO{
		ID:            l.ID,
		Title:         l.Title,
		URL:           l.URL,
		BackupURL:     l.BackupURL,
		Description:   l.Description,
		IconURL:       IconURL(iconStr),
		CategoryID:    l.CategoryID,
		CategoryName:  catName,
		IsPrivate:     l.IsPrivate,
		Status:        l.LastStatus,
		Sort:          l.Sort,
		LastCheckedAt: l.LastCheckedAt,
	}, nil
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
