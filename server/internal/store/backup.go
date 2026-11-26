package store

import (
	"strings"
	"time"
)

type BackupCategory struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	IconPath    *string `json:"iconPath,omitempty"`
	ParentID    *int64  `json:"parentId,omitempty"`
	Sort        int64   `json:"sort"`
	IsPrivate   bool    `json:"isPrivate"`
	Description *string `json:"description,omitempty"`
}

type BackupLink struct {
	ID          int64   `json:"id"`
	CategoryID  int64   `json:"categoryId"`
	Title       string  `json:"title"`
	URL         string  `json:"url"`
	BackupURL   *string `json:"backupUrl,omitempty"`
	Description *string `json:"description,omitempty"`
	Sort        int64   `json:"sort"`
	IsPrivate   bool    `json:"isPrivate"`
}

type BackupData struct {
	Version    int               `json:"version"`
	ExportedAt int64             `json:"exportedAt"`
	Settings   map[string]string `json:"settings"`
	Categories []BackupCategory  `json:"categories"`
	Links      []BackupLink      `json:"links"`
}

type ImportResult struct {
	ImportedCategories int `json:"importedCategories"`
	ImportedLinks      int `json:"importedLinks"`
}

// ExportData exports settings (excluding secrets), categories, and links.
func (s *Store) ExportData() (*BackupData, error) {
	data := &BackupData{
		Version:    1,
		ExportedAt: time.Now().UnixMilli(),
		Settings:   make(map[string]string),
		Categories: make([]BackupCategory, 0),
		Links:      make([]BackupLink, 0),
	}

	// 1. Settings (exclude secret.*)
	rows, err := s.DB.Query(`SELECT key, value FROM setting WHERE key NOT LIKE 'secret.%'`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			rows.Close()
			return nil, err
		}
		data.Settings[k] = v
	}
	rows.Close()

	// 2. Categories ordered by parent_id IS NOT NULL, sort ASC, id ASC
	cats, err := s.ListCategories()
	if err != nil {
		return nil, err
	}
	for _, c := range cats {
		data.Categories = append(data.Categories, BackupCategory{
			ID:          c.ID,
			Name:        c.Name,
			IconPath:    c.IconPath,
			ParentID:    c.ParentID,
			Sort:        c.Sort,
			IsPrivate:   c.IsPrivate,
			Description: c.Description,
		})
	}

	// 3. Links
	links, err := s.ListLinks(true)
	if err != nil {
		return nil, err
	}
	for _, l := range links {
		data.Links = append(data.Links, BackupLink{
			ID:          l.ID,
			CategoryID:  l.CategoryID,
			Title:       l.Title,
			URL:         l.URL,
			BackupURL:   l.BackupURL,
			Description: l.Description,
			Sort:        l.Sort,
			IsPrivate:   l.IsPrivate,
		})
	}

	return data, nil
}

// ImportData imports backup data using either "merge" or "overwrite" mode.
func (s *Store) ImportData(data *BackupData, mode string) (*ImportResult, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	now := time.Now().UnixMilli()
	res := &ImportResult{}

	if mode == "overwrite" {
		if _, err := tx.Exec(`DELETE FROM link`); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(`DELETE FROM category`); err != nil {
			return nil, err
		}
	}

	// 1. Update settings (skip secret.*)
	for k, v := range data.Settings {
		if strings.HasPrefix(k, "secret.") {
			continue
		}
		if _, err := tx.Exec(
			`INSERT INTO setting(key, value, updated_at) VALUES(?, ?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			k, v, now,
		); err != nil {
			return nil, err
		}
	}

	// 2. Import categories: parent categories first, then child categories
	oldToNewCatID := make(map[int64]int64)

	var rootCats []BackupCategory
	var childCats []BackupCategory
	for _, c := range data.Categories {
		if c.ParentID == nil || *c.ParentID == 0 {
			rootCats = append(rootCats, c)
		} else {
			childCats = append(childCats, c)
		}
	}

	importCategory := func(c BackupCategory, parentID *int64) (int64, error) {
		priv := 0
		if c.IsPrivate {
			priv = 1
		}
		if mode == "merge" {
			var existingID int64
			var err error
			if parentID == nil {
				err = tx.QueryRow(`SELECT id FROM category WHERE parent_id IS NULL AND name = ?`, c.Name).Scan(&existingID)
			} else {
				err = tx.QueryRow(`SELECT id FROM category WHERE parent_id = ? AND name = ?`, *parentID, c.Name).Scan(&existingID)
			}
			if err == nil && existingID > 0 {
				return existingID, nil
			}
		}

		insertRes, err := tx.Exec(
			`INSERT INTO category(name, icon_path, parent_id, sort, is_private, description, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
			c.Name, nullableString(c.IconPath), parentID, c.Sort, priv, nullableString(c.Description), now, now,
		)
		if err != nil {
			return 0, err
		}
		newID, _ := insertRes.LastInsertId()
		res.ImportedCategories++
		return newID, nil
	}

	for _, c := range rootCats {
		newID, err := importCategory(c, nil)
		if err != nil {
			return nil, err
		}
		oldToNewCatID[c.ID] = newID
	}

	for _, c := range childCats {
		var parentID *int64
		if mappedParent, ok := oldToNewCatID[*c.ParentID]; ok {
			parentID = &mappedParent
		}
		newID, err := importCategory(c, parentID)
		if err != nil {
			return nil, err
		}
		oldToNewCatID[c.ID] = newID
	}

	// 3. Import links
	for _, l := range data.Links {
		mappedCatID, ok := oldToNewCatID[l.CategoryID]
		if !ok {
			continue
		}

		if mode == "merge" {
			var cnt int64
			_ = tx.QueryRow(`SELECT COUNT(*) FROM link WHERE category_id = ? AND url = ?`, mappedCatID, l.URL).Scan(&cnt)
			if cnt > 0 {
				continue
			}
		}

		priv := 0
		if l.IsPrivate {
			priv = 1
		}
		host := sampleHost(l.URL)
		titleNorm := sampleNormalize(l.Title)
		desc := ""
		if l.Description != nil {
			desc = *l.Description
		}
		searchText := sampleJoinLower(titleNorm, host, desc)

		if _, err := tx.Exec(
			`INSERT INTO link(category_id, title, url, backup_url, description, sort,
			                  is_private, last_status, title_norm, host, search_text, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, 'unknown', ?, ?, ?, ?, ?)`,
			mappedCatID, l.Title, l.URL, nullableString(l.BackupURL), nullableString(l.Description),
			l.Sort, priv, titleNorm, host, searchText, now, now,
		); err != nil {
			if strings.Contains(err.Error(), "UNIQUE constraint failed") {
				continue
			}
			return nil, err
		}
		res.ImportedLinks++
	}

	return res, tx.Commit()
}


