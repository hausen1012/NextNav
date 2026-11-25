package store

import "database/sql"

// Admin represents an administrator account row.
type Admin struct {
	ID           int64
	Username     string
	PasswordHash string
	CreatedAt    int64
	UpdatedAt    int64
}

// Category represents a navigation category row.
type Category struct {
	ID          int64
	Name        string
	IconPath    *string
	ParentID    *int64
	Sort        int64
	IsPrivate   bool
	IsSample    bool
	Description *string
	CreatedAt   int64
	UpdatedAt   int64
}

// Link represents a bookmark link row.
type Link struct {
	ID            int64
	CategoryID    int64
	Title         string
	URL           string
	BackupURL     *string
	Description   *string
	IconPath      *string
	IconSource    *string
	Sort          int64
	IsPrivate     bool
	IsSample      bool
	LastStatus    string
	LastCheckedAt *int64
	TitleNorm     string
	Host          string
	SearchText    string
	CreatedAt     int64
	UpdatedAt     int64
}

func nilIfEmptyStr(s sql.NullString) *string {
	if !s.Valid || s.String == "" {
		return nil
	}
	v := s.String
	return &v
}

func nilIfZeroInt64(i sql.NullInt64) *int64 {
	if !i.Valid {
		return nil
	}
	v := i.Int64
	return &v
}

func nullableString(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}

func nullableInt64(i *int64) any {
	if i == nil || *i <= 0 {
		return nil
	}
	return *i
}
