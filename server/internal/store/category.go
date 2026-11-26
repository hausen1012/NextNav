package store

import (
	"database/sql"
	"errors"
	"net/url"
	"strings"
	"time"
)

// ListCategories returns all categories ordered by hierarchy and sort index.
func (s *Store) ListCategories() ([]Category, error) {
	rows, err := s.DB.Query(
		`SELECT id, name, icon_path, parent_id, sort, is_private, description, created_at, updated_at
		 FROM category ORDER BY parent_id IS NOT NULL, sort ASC, created_at ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Category
	for rows.Next() {
		var c Category
		var (
			iconPath sql.NullString
			parentID sql.NullInt64
			priv     int64
			desc     sql.NullString
		)
		if err := rows.Scan(
			&c.ID, &c.Name, &iconPath, &parentID, &c.Sort,
			&priv, &desc, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		c.IconPath = nilIfEmptyStr(iconPath)
		c.ParentID = nilIfZeroInt64(parentID)
		c.IsPrivate = priv == 1
		c.Description = nilIfEmptyStr(desc)
		list = append(list, c)
	}
	return list, rows.Err()
}

// GetCategory returns a category by id.
func (s *Store) GetCategory(id int64) (*Category, error) {
	var c Category
	var (
		iconPath sql.NullString
		parentID sql.NullInt64
		priv     int64
		desc     sql.NullString
	)
	err := s.DB.QueryRow(
		`SELECT id, name, icon_path, parent_id, sort, is_private, description, created_at, updated_at
		 FROM category WHERE id = ?`, id,
	).Scan(&c.ID, &c.Name, &iconPath, &parentID, &c.Sort, &priv, &desc, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	c.IconPath = nilIfEmptyStr(iconPath)
	c.ParentID = nilIfZeroInt64(parentID)
	c.IsPrivate = priv == 1
	c.Description = nilIfEmptyStr(desc)
	return &c, nil
}

// CategoryExists checks whether a category exists.
func (s *Store) CategoryExists(id int64) (bool, error) {
	var n int
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM category WHERE id = ?`, id).Scan(&n)
	return err == nil && n > 0, err
}

// GetCategoryChildrenCount returns the number of subcategories under a parent category.
func (s *Store) GetCategoryChildrenCount(id int64) (int64, error) {
	var count int64
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM category WHERE parent_id = ?`, id).Scan(&count)
	return count, err
}

// CreateCategory inserts a new category and returns its ID.
func (s *Store) CreateCategory(c *Category) (int64, error) {
	now := time.Now().UnixMilli()
	priv := 0
	if c.IsPrivate {
		priv = 1
	}

	res, err := s.DB.Exec(
		`INSERT INTO category(name, icon_path, parent_id, sort, is_private, description, created_at, updated_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		c.Name, nullableString(c.IconPath), nullableInt64(c.ParentID), c.Sort, priv, nullableString(c.Description), now, now,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdateCategory updates an existing category. If renameLinks is true, link search_text is recalculated.
func (s *Store) UpdateCategory(c *Category, renameLinks bool) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	priv := 0
	if c.IsPrivate {
		priv = 1
	}
	now := time.Now().UnixMilli()

	if _, err := tx.Exec(
		`UPDATE category SET name = ?, icon_path = ?, parent_id = ?, sort = ?, is_private = ?, description = ?, updated_at = ?
		 WHERE id = ?`,
		c.Name, nullableString(c.IconPath), nullableInt64(c.ParentID), c.Sort, priv, nullableString(c.Description), now, c.ID,
	); err != nil {
		return err
	}

	if renameLinks {
		if err := recomputeCategorySearchTx(tx, c.ID, c.Name); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetCategoryFamilyIDs returns the category id itself, and if it is a root, all its child ids.
func (s *Store) GetCategoryFamilyIDs(id int64) ([]int64, error) {
	ids := []int64{id}
	var parentID sql.NullInt64
	if err := s.DB.QueryRow(`SELECT parent_id FROM category WHERE id = ?`, id).Scan(&parentID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if !parentID.Valid {
		rows, err := s.DB.Query(`SELECT id FROM category WHERE parent_id = ?`, id)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var cid int64
			if err := rows.Scan(&cid); err == nil {
				ids = append(ids, cid)
			}
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	return ids, nil
}

// DeleteCategory removes categories and handles links according to mode ("move" or "delete").
func (s *Store) DeleteCategory(ids []int64, mode string, targetID int64) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if mode == "move" {
		for _, cid := range ids {
			if _, err := tx.Exec(`UPDATE link SET category_id = ? WHERE category_id = ?`, targetID, cid); err != nil {
				return err
			}
		}
	}

	for _, cid := range ids {
		if _, err := tx.Exec(`DELETE FROM category WHERE id = ?`, cid); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func recomputeCategorySearchTx(tx *sql.Tx, categoryID int64, categoryName string) error {
	rows, err := tx.Query(`SELECT id, title, url, description FROM link WHERE category_id = ?`, categoryID)
	if err != nil {
		return err
	}
	type item struct {
		id          int64
		title       string
		url         string
		description sql.NullString
	}
	var items []item
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.id, &it.title, &it.url, &it.description); err != nil {
			rows.Close()
			return err
		}
		items = append(items, it)
	}
	rows.Close()

	for _, it := range items {
		host := ""
		if u, err := url.Parse(it.url); err == nil {
			host = strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
		}
		titleNorm := strings.ToLower(strings.Join(strings.Fields(it.title), " "))

		var b strings.Builder
		for _, p := range []string{titleNorm, host, it.description.String, categoryName} {
			p = strings.ToLower(strings.TrimSpace(p))
			if p == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteByte(' ')
			}
			b.WriteString(p)
		}
		search := b.String()

		if _, err := tx.Exec(`UPDATE link SET search_text = ? WHERE id = ?`, search, it.id); err != nil {
			return err
		}
	}
	return nil
}

