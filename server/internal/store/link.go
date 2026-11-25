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
	             sort, is_private, is_sample, last_status,
	             last_checked_at, title_norm, host, search_text,
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
		        sort, is_private, is_sample, last_status,
		        last_checked_at, title_norm, host, search_text,
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
		                  sort, is_private, is_sample, last_status,
		                  last_checked_at, title_norm, host, search_text,
		                  created_at, updated_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
		l.CategoryID, l.Title, l.URL, nullableString(l.BackupURL), nullableString(l.Description),
		nullableString(l.IconPath), nullableString(l.IconSource), l.Sort, priv, sample,
		status, l.TitleNorm, l.Host, l.SearchText, now, now,
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
		                 title_norm = ?, host = ?, search_text = ?,
		                 updated_at = ?
		 WHERE id = ?`,
		l.CategoryID, l.Title, l.URL, nullableString(l.BackupURL), nullableString(l.Description),
		nullableString(l.IconPath), nullableString(l.IconSource), l.Sort, priv,
		l.TitleNorm, l.Host, l.SearchText, now, l.ID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return ErrDuplicate
		}
		return err
	}
	return nil
}

// SetLinkIcon updates a link's icon path and source. A nil path clears the icon.
func (s *Store) SetLinkIcon(id int64, iconPath, iconSource *string) error {
	now := time.Now().UnixMilli()
	res, err := s.DB.Exec(
		`UPDATE link SET icon_path = ?, icon_source = ?, updated_at = ? WHERE id = ?`,
		nullableString(iconPath), nullableString(iconSource), now, id,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

// CountIconReferences counts every row that still points at the icon path,
// including categories and the site logo.
func (s *Store) CountIconReferences(relPath string) (int64, error) {
	if relPath == "" {
		return 0, nil
	}
	var total int64
	if err := s.DB.QueryRow(`SELECT COUNT(*) FROM link WHERE icon_path = ?`, relPath).Scan(&total); err != nil {
		return 0, err
	}
	var n int64
	if err := s.DB.QueryRow(`SELECT COUNT(*) FROM category WHERE icon_path = ?`, relPath).Scan(&n); err != nil {
		return 0, err
	}
	total += n
	if err := s.DB.QueryRow(`SELECT COUNT(*) FROM setting WHERE key = 'site.logo_path' AND value = ?`, relPath).Scan(&n); err != nil {
		return 0, err
	}
	return total + n, nil
}

// ListIconPaths returns every icon path referenced by links, categories or the logo.
func (s *Store) ListIconPaths() ([]string, error) {
	rows, err := s.DB.Query(`
		SELECT icon_path FROM link WHERE icon_path IS NOT NULL AND icon_path <> ''
		UNION
		SELECT icon_path FROM category WHERE icon_path IS NOT NULL AND icon_path <> ''
		UNION
		SELECT value FROM setting WHERE key = 'site.logo_path' AND value <> ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// DeleteLink deletes a link by ID.
func (s *Store) DeleteLink(id int64) error {
	_, err := s.DB.Exec(`DELETE FROM link WHERE id = ?`, id)
	return err
}

// BatchDeleteLinks deletes multiple links by ID.
func (s *Store) BatchDeleteLinks(ids []int64) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var deleted int64
	for _, id := range ids {
		res, err := tx.Exec(`DELETE FROM link WHERE id = ?`, id)
		if err != nil {
			return 0, err
		}
		n, _ := res.RowsAffected()
		deleted += n
	}
	return deleted, tx.Commit()
}

// BatchMoveLinks moves multiple links to a target category.
func (s *Store) BatchMoveLinks(ids []int64, targetCategoryID int64) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	now := time.Now().UnixMilli()
	tx, err := s.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var moved int64
	for _, id := range ids {
		res, err := tx.Exec(`UPDATE link SET category_id = ?, updated_at = ? WHERE id = ?`, targetCategoryID, now, id)
		if err != nil {
			if strings.Contains(err.Error(), "UNIQUE constraint failed") {
				return 0, ErrDuplicate
			}
			return 0, err
		}
		n, _ := res.RowsAffected()
		moved += n
	}
	return moved, tx.Commit()
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
		lastCheck                       sql.NullInt64
		priv, sample                    int64
	)
	err := rows.Scan(
		&l.ID, &l.CategoryID, &l.Title, &l.URL, &backup, &desc, &iconPath, &iconSrc,
		&l.Sort, &priv, &sample, &l.LastStatus,
		&lastCheck, &l.TitleNorm, &l.Host, &l.SearchText,
		&l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		return l, err
	}
	l.BackupURL = nilIfEmptyStr(backup)
	l.Description = nilIfEmptyStr(desc)
	l.IconPath = nilIfEmptyStr(iconPath)
	l.IconSource = nilIfEmptyStr(iconSrc)
	l.LastCheckedAt = nilIfZeroInt64(lastCheck)
	l.IsPrivate = priv == 1
	l.IsSample = sample == 1
	return l, nil
}

func scanLinkSingle(row *sql.Row) (Link, error) {
	var l Link
	var (
		backup, desc, iconPath, iconSrc sql.NullString
		lastCheck                       sql.NullInt64
		priv, sample                    int64
	)
	err := row.Scan(
		&l.ID, &l.CategoryID, &l.Title, &l.URL, &backup, &desc, &iconPath, &iconSrc,
		&l.Sort, &priv, &sample, &l.LastStatus,
		&lastCheck, &l.TitleNorm, &l.Host, &l.SearchText,
		&l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		return l, err
	}
	l.BackupURL = nilIfEmptyStr(backup)
	l.Description = nilIfEmptyStr(desc)
	l.IconPath = nilIfEmptyStr(iconPath)
	l.IconSource = nilIfEmptyStr(iconSrc)
	l.LastCheckedAt = nilIfZeroInt64(lastCheck)
	l.IsPrivate = priv == 1
	l.IsSample = sample == 1
	return l, nil
}
