package store

import (
	"database/sql"
	"errors"
	"time"
)

type LinkCheck struct {
	ID         int64
	LinkID     int64
	OK         bool
	HTTPStatus *int
	LatencyMs  *int64
	ErrorType  *string
	CheckedAt  int64
}

type CheckItem struct {
	LinkID       int64   `json:"linkId"`
	Title        string  `json:"title"`
	URL          string  `json:"url"`
	CategoryName string  `json:"categoryName"`
	Status       string  `json:"status"`
	HTTPStatus   *int    `json:"httpStatus"`
	LatencyMs    *int64  `json:"latencyMs"`
	ErrorType    *string `json:"errorType"`
	CheckedAt    int64   `json:"checkedAt"`
}

// RecordLinkCheck records the result of a health check and updates the link status.
// It also trims check history for this link to the most recent 30 entries.
func (s *Store) RecordLinkCheck(linkID int64, ok bool, httpStatus *int, latencyMs *int64, errorType *string, status string) error {
	now := time.Now().UnixMilli()
	okInt := 0
	if ok {
		okInt = 1
	}

	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Insert link_check record
	_, err = tx.Exec(
		`INSERT INTO link_check(link_id, ok, http_status, latency_ms, error_type, checked_at)
		 VALUES(?, ?, ?, ?, ?, ?)`,
		linkID, okInt, httpStatus, latencyMs, nullableString(errorType), now,
	)
	if err != nil {
		return err
	}

	// 2. Update link last_status & last_checked_at
	res, err := tx.Exec(
		`UPDATE link SET last_status = ?, last_checked_at = ? WHERE id = ?`,
		status, now, linkID,
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

	// 3. Trim old checks keeping at most 30 recent entries
	_, _ = tx.Exec(
		`DELETE FROM link_check
		 WHERE link_id = ?
		   AND id NOT IN (
		     SELECT id FROM link_check WHERE link_id = ? ORDER BY checked_at DESC, id DESC LIMIT 30
		   )`,
		linkID, linkID,
	)

	return tx.Commit()
}

// ListChecks lists link health check records with category details and filters.
func (s *Store) ListChecks(status string, categoryID *int64, page, pageSize int) ([]CheckItem, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	baseWhere := `WHERE 1=1`
	args := []any{}

	if status != "" && status != "all" {
		baseWhere += ` AND l.last_status = ?`
		args = append(args, status)
	}
	if categoryID != nil && *categoryID > 0 {
		baseWhere += ` AND l.category_id = ?`
		args = append(args, *categoryID)
	}

	// Count total
	countQuery := `SELECT COUNT(*) FROM link l ` + baseWhere
	var total int
	if err := s.DB.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Query paginated items
	dataQuery := `
		SELECT l.id, l.title, l.url, c.name, l.last_status,
		       lc.http_status, lc.latency_ms, lc.error_type, COALESCE(l.last_checked_at, 0)
		FROM link l
		JOIN category c ON l.category_id = c.id
		LEFT JOIN link_check lc ON lc.id = (
			SELECT id FROM link_check WHERE link_id = l.id ORDER BY checked_at DESC, id DESC LIMIT 1
		)
		` + baseWhere + `
		ORDER BY
			CASE l.last_status
				WHEN 'dead' THEN 1
				WHEN 'warn' THEN 2
				WHEN 'unknown' THEN 3
				ELSE 4
			END ASC,
			l.last_checked_at DESC,
			l.id ASC
		LIMIT ? OFFSET ?
	`
	queryArgs := append(args, pageSize, offset)

	rows, err := s.DB.Query(dataQuery, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []CheckItem
	for rows.Next() {
		var item CheckItem
		var httpStatus sql.NullInt64
		var latencyMs sql.NullInt64
		var errorType sql.NullString
		var checkedAt int64

		if err := rows.Scan(
			&item.LinkID,
			&item.Title,
			&item.URL,
			&item.CategoryName,
			&item.Status,
			&httpStatus,
			&latencyMs,
			&errorType,
			&checkedAt,
		); err != nil {
			return nil, 0, err
		}

		if httpStatus.Valid {
			v := int(httpStatus.Int64)
			item.HTTPStatus = &v
		}
		if latencyMs.Valid {
			v := latencyMs.Int64
			item.LatencyMs = &v
		}
		if errorType.Valid && errorType.String != "" {
			v := errorType.String
			item.ErrorType = &v
		}
		item.CheckedAt = checkedAt
		items = append(items, item)
	}

	if items == nil {
		items = []CheckItem{}
	}
	return items, total, rows.Err()
}

// GetLatestCheck returns the most recent check for a link.
func (s *Store) GetLatestCheck(linkID int64) (*LinkCheck, error) {
	row := s.DB.QueryRow(
		`SELECT id, link_id, ok, http_status, latency_ms, error_type, checked_at
		 FROM link_check
		 WHERE link_id = ?
		 ORDER BY checked_at DESC, id DESC LIMIT 1`,
		linkID,
	)
	var lc LinkCheck
	var okInt int
	var httpStatus sql.NullInt64
	var latencyMs sql.NullInt64
	var errorType sql.NullString

	if err := row.Scan(&lc.ID, &lc.LinkID, &okInt, &httpStatus, &latencyMs, &errorType, &lc.CheckedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	lc.OK = okInt == 1
	if httpStatus.Valid {
		v := int(httpStatus.Int64)
		lc.HTTPStatus = &v
	}
	if latencyMs.Valid {
		v := latencyMs.Int64
		lc.LatencyMs = &v
	}
	if errorType.Valid && errorType.String != "" {
		v := errorType.String
		lc.ErrorType = &v
	}
	return &lc, nil
}
