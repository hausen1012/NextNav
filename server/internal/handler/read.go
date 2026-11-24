package handler

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"nextnav/internal/httpx"
)

// --- read models shared by /home and /links ---

type linkDTO struct {
	ID            int64   `json:"id"`
	Title         string  `json:"title"`
	URL           string  `json:"url"`
	BackupURL     *string `json:"backupUrl"`
	Description   *string `json:"description"`
	IconURL       *string `json:"iconUrl"`
	CategoryID    int64   `json:"categoryId"`
	CategoryName  string  `json:"categoryName,omitempty"`
	IsPrivate     bool    `json:"isPrivate"`
	Status        string  `json:"status"`
	ClickCount    int64   `json:"clickCount"`
	LastCheckedAt *int64  `json:"lastCheckedAt"`
	MatchedField  string  `json:"matchedField,omitempty"`
}

type categoryDTO struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	IconURL   *string   `json:"iconUrl"`
	Sort      int64     `json:"sort"`
	IsPrivate bool      `json:"isPrivate"`
	Links     []linkDTO `json:"links"`
	ParentID  *int64    `json:"parentId,omitempty"`
}

type groupDTO struct {
	ID         int64         `json:"id"`
	Name       string        `json:"name"`
	IconURL    *string       `json:"iconUrl"`
	Sort       int64         `json:"sort"`
	Links      []linkDTO     `json:"links"`
	Categories []categoryDTO `json:"categories"`
}

func nilIfEmpty(s sql.NullString) *string {
	if !s.Valid || s.String == "" {
		return nil
	}
	v := s.String
	return &v
}

func nilIfZero(i sql.NullInt64) *int64 {
	if !i.Valid {
		return nil
	}
	v := i.Int64
	return &v
}

// scanLink reads the columns selected in linkSelect.
func scanLink(rows *sql.Rows) (linkDTO, error) {
	var (
		d         linkDTO
		backup    sql.NullString
		desc      sql.NullString
		iconPath  sql.NullString
		priv      int64
		lastCheck sql.NullInt64
	)
	err := rows.Scan(
		&d.ID, &d.Title, &d.URL, &backup, &desc, &iconPath,
		&d.CategoryID, &priv, &d.Status, &d.ClickCount, &lastCheck,
	)
	if err != nil {
		return d, err
	}
	d.BackupURL = nilIfEmpty(backup)
	d.Description = nilIfEmpty(desc)
	d.IconURL = iconURL(iconPath.String)
	d.IsPrivate = priv == 1
	d.LastCheckedAt = nilIfZero(lastCheck)
	return d, nil
}

const linkSelect = `
SELECT id, title, url, backup_url, description, icon_path,
       category_id, is_private, last_status, click_count, last_checked_at
FROM link`

// --- /api/home ---

type homeResp struct {
	Site   PublicSite `json:"site"`
	Groups []groupDTO `json:"groups"`
}

func (a *API) Home(w http.ResponseWriter, r *http.Request) {
	admin := httpx.IdentityFrom(r.Context()).IsAdmin()

	groups, err := a.loadTree(admin, true)
	if err != nil {
		httpx.Fail(w, 500, "internal", "加载首页失败")
		return
	}
	httpx.JSON(w, 200, homeResp{Site: a.publicSite(), Groups: groups})
}

// loadTree builds the two-level category tree. When withLinks is false the
// link arrays are empty (used by /api/categories).
func (a *API) loadTree(admin, withLinks bool) ([]groupDTO, error) {
	rows, err := a.Store.DB.Query(
		`SELECT id, name, icon_path, parent_id, sort, is_private
		 FROM category ORDER BY parent_id IS NOT NULL, sort, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type row struct {
		id        int64
		name      string
		iconPath  sql.NullString
		parentID  sql.NullInt64
		sort      int64
		isPrivate bool
	}
	var flat []row
	for rows.Next() {
		var x row
		var priv int64
		if err := rows.Scan(&x.id, &x.name, &x.iconPath, &x.parentID, &x.sort, &priv); err != nil {
			return nil, err
		}
		x.isPrivate = priv == 1
		flat = append(flat, x)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Index categories by id and group children under their parent.
	children := map[int64][]row{}
	var roots []row
	for _, x := range flat {
		if x.parentID.Valid {
			children[x.parentID.Int64] = append(children[x.parentID.Int64], x)
		} else {
			roots = append(roots, x)
		}
	}

	// Private categories are invisible to guests: drop them before they can
	// be attached anywhere.
	visible := func(x row) bool { return admin || !x.isPrivate }

	linksByCat := map[int64][]linkDTO{}
	if withLinks {
		if linksByCat, err = a.loadLinksByCategory(admin); err != nil {
			return nil, err
		}
	}

	out := make([]groupDTO, 0, len(roots))
	for _, g := range roots {
		if !visible(g) {
			continue
		}
		gd := groupDTO{
			ID: g.id, Name: g.name, IconURL: iconURL(g.iconPath.String), Sort: g.sort,
			Links:      append([]linkDTO{}, linksByCat[g.id]...),
			Categories: []categoryDTO{},
		}
		for _, c := range children[g.id] {
			if !visible(c) {
				continue
			}
			var pid int64 = g.id
			gd.Categories = append(gd.Categories, categoryDTO{
				ID: c.id, Name: c.name, IconURL: iconURL(c.iconPath.String),
				Sort: c.sort, IsPrivate: c.isPrivate, ParentID: &pid,
				Links: append([]linkDTO{}, linksByCat[c.id]...),
			})
		}
		if gd.Links == nil {
			gd.Links = []linkDTO{}
		}
		out = append(out, gd)
	}
	return out, nil
}

// loadLinksByCategory returns visible links grouped by category id.
func (a *API) loadLinksByCategory(admin bool) (map[int64][]linkDTO, error) {
	q := linkSelect
	if !admin {
		q += ` WHERE is_private = 0`
	}
	q += ` ORDER BY sort, id`

	rows, err := a.Store.DB.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int64][]linkDTO{}
	for rows.Next() {
		d, err := scanLink(rows)
		if err != nil {
			return nil, err
		}
		out[d.CategoryID] = append(out[d.CategoryID], d)
	}
	return out, rows.Err()
}

// --- /api/categories ---

func (a *API) ListCategories(w http.ResponseWriter, r *http.Request) {
	admin := httpx.IdentityFrom(r.Context()).IsAdmin()
	groups, err := a.loadTree(admin, false)
	if err != nil {
		httpx.Fail(w, 500, "internal", "加载分类失败")
		return
	}
	httpx.JSON(w, 200, map[string]any{"groups": groups})
}

// --- /api/settings ---

type settingsResp struct {
	Site PublicSite `json:"site"`
}

func (a *API) GetSettings(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, 200, settingsResp{Site: a.publicSite()})
}

// helper for tests and internal callers
func nowMillis() int64 { return time.Now().UnixMilli() }

func parseID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}
