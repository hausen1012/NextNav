package store

import (
	"database/sql"
	"errors"
	"strings"
	"time"
)

// ListLinks returns all links. If admin is false, private links are omitted.
func (s *Store) ListLinks(admin bool) ([]Link, error) {
	q := `SELECT id, category_id, title, url, backup_url, description, icon_path, icon_source,
	             sort, is_private, is_sample, click_count, last_clicked_at, last_status,
	             last_checked_at, title_norm, host, pinyin_full, pinyin_short, search_text,
	             created_at, updated_at
	      FROM link`
	if !admin {
		q += ` WHERE is_private = 0`
	}
	q += ` ORDER BY sort ASC, created_at ASC, id ASC`

	rows, err := s.DB.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Link
	for rows.Next() {
		l, err := scanLinkRow(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, l)
	}
	return list, rows.Err()
}

// GetLink returns a link by id.
func (s *Store) GetLink(id int64) (*Link, error) {
	row := s.DB.QueryRow(
		`SELECT id, category_id, title, url, backup_url, description, icon_path, icon_source,
		        sort, is_private, is_sample, click_count, last_clicked_at, last_status,
		        last_checked_at, title_norm, host, pinyin_full, pinyin_short, search_text,
		        created_at, updated_at
		 FROM link WHERE id = ?`, id,
	)
	l, err := scanLinkSingle(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// CategoryHasDuplicateLink checks whether the category already contains the URL.
func (s *Store) CategoryHasDuplicateLink(categoryID int64, url string) (bool, error) {
	var count int64
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM link WHERE category_id = ? AND url = ?`, categoryID, url).Scan(&count)
	return count > 0, err
}

// GetLinkMaxSort returns the maximum sort value in a category.
func (s *Store) GetLinkMaxSort(categoryID int64) (int64, error) {
	var maxSort int64
	err := s.DB.QueryRow(`SELECT COALESCE(MAX(sort), 0) FROM link WHERE category_id = ?`, categoryID).Scan(&maxSort)
	return maxSort, err
}

// CreateLink inserts a new link.
func (s *Store) CreateLink(l *Link) (int64, error) {
	now := time.Now().UnixMilli()
	priv := 0
	if l.IsPrivate {
		priv = 1
	}
	sample := 0
	if l.IsSample {
		sample = 1
	}
	status := l.LastStatus
	if status == "" {
		status = "unknown"
	}

	res, err := s.DB.Exec(
		`INSERT INTO link(category_id, title, url, backup_url, description, icon_path, icon_source,
		                  sort, is_private, is_sample, click_count, last_clicked_at, last_status,
		                  last_checked_at, title_norm, host, pinyin_full, pinyin_short, search_text,
		                  created_at, updated_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
		l.CategoryID, l.Title, l.URL, nullableString(l.BackupURL), nullableString(l.Description),
		nullableString(l.IconPath), nullableString(l.IconSource), l.Sort, priv, sample,
		status, l.TitleNorm, l.Host, l.PinyinFull, l.PinyinShort, l.SearchText, now, now,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return 0, ErrDuplicate
		}
		return 0, err
	}
	return res.LastInsertId()
}

// UpdateLink updates an existing link.
func (s *Store) UpdateLink(l *Link) error {
	now := time.Now().UnixMilli()
	priv := 0
	if l.IsPrivate {
		priv = 1
	}

	_, err := s.DB.Exec(
		`UPDATE link SET category_id = ?, title = ?, url = ?, backup_url = ?, description = ?,
		                 icon_path = ?, icon_source = ?, sort = ?, is_private = ?, is_sample = 0,
		                 title_norm = ?, host = ?, pinyin_full = ?, pinyin_short = ?, search_text = ?,
		                 updated_at = ?
		 WHERE id = ?`,
		l.CategoryID, l.Title, l.URL, nullableString(l.BackupURL), nullableString(l.Description),
		nullableString(l.IconPath), nullableString(l.IconSource), l.Sort, priv,
		l.TitleNorm, l.Host, l.PinyinFull, l.PinyinShort, l.SearchText, now, l.ID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return ErrDuplicate
		}
		return err
	}
	return nil
}

// DeleteLink deletes a link by ID.
func (s *Store) DeleteLink(id int64) error {
	_, err := s.DB.Exec(`DELETE FROM link WHERE id = ?`, id)
	return err
}

// ListLinkIDsByCategory returns all link IDs under a category.
func (s *Store) ListLinkIDsByCategory(categoryID int64) ([]int64, error) {
	rows, err := s.DB.Query(`SELECT id FROM link WHERE category_id = ?`, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ReorderLinks atomically updates the sort indices of links under a category.
func (s *Store) ReorderLinks(categoryID int64, orderedIDs []int64) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for i, id := range orderedIDs {
		if _, err := tx.Exec(
			`UPDATE link SET sort = ? WHERE id = ? AND category_id = ?`,
			int64(i+1)*1000, id, categoryID,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// CountLinksByCategories returns the total count of links across given categories.
func (s *Store) CountLinksByCategories(categoryIDs []int64) (int64, error) {
	var total int64
	for _, cid := range categoryIDs {
		var n int64
		if err := s.DB.QueryRow(`SELECT COUNT(*) FROM link WHERE category_id = ?`, cid).Scan(&n); err != nil {
			return 0, err
		}
		total += n
	}
	return total, nil
}

func scanLinkRow(rows *sql.Rows) (Link, error) {
	var l Link
	var (
		backup, desc, iconPath, iconSrc sql.NullString
		lastClick, lastCheck            sql.NullInt64
		priv, sample                    int64
	)
	err := rows.Scan(
		&l.ID, &l.CategoryID, &l.Title, &l.URL, &backup, &desc, &iconPath, &iconSrc,
		&l.Sort, &priv, &sample, &l.ClickCount, &lastClick, &l.LastStatus,
		&lastCheck, &l.TitleNorm, &l.Host, &l.PinyinFull, &l.PinyinShort, &l.SearchText,
		&l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		return l, err
	}
	l.BackupURL = nilIfEmptyStr(backup)
	l.Description = nilIfEmptyStr(desc)
	l.IconPath = nilIfEmptyStr(iconPath)
	l.IconSource = nilIfEmptyStr(iconSrc)
	l.LastClickedAt = nilIfZeroInt64(lastClick)
	l.LastCheckedAt = nilIfZeroInt64(lastCheck)
	l.IsPrivate = priv == 1
	l.IsSample = sample == 1
	return l, nil
}

func scanLinkSingle(row *sql.Row) (Link, error) {
	var l Link
	var (
		backup, desc, iconPath, iconSrc sql.NullString
		lastClick, lastCheck            sql.NullInt64
		priv, sample                    int64
	)
	err := row.Scan(
		&l.ID, &l.CategoryID, &l.Title, &l.URL, &backup, &desc, &iconPath, &iconSrc,
		&l.Sort, &priv, &sample, &l.ClickCount, &lastClick, &l.LastStatus,
		&lastCheck, &l.TitleNorm, &l.Host, &l.PinyinFull, &l.PinyinShort, &l.SearchText,
		&l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		return l, err
	}
	l.BackupURL = nilIfEmptyStr(backup)
	l.Description = nilIfEmptyStr(desc)
	l.IconPath = nilIfEmptyStr(iconPath)
	l.IconSource = nilIfEmptyStr(iconSrc)
	l.LastClickedAt = nilIfZeroInt64(lastClick)
	l.LastCheckedAt = nilIfZeroInt64(lastCheck)
	l.IsPrivate = priv == 1
	l.IsSample = sample == 1
	return l, nil
}
