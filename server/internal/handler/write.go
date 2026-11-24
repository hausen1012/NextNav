package handler

import (
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"nextnav/internal/auth"
	"nextnav/internal/httpx"
)

func authVerify(hash, password string) bool { return auth.VerifyPassword(hash, password) }

func hashPassword(password string) (string, error) { return auth.HashPassword(password) }

// --- index helpers ---

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

func validURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

// --- links ---

type linkReq struct {
	CategoryID  int64   `json:"categoryId"`
	Title       string  `json:"title"`
	URL         string  `json:"url"`
	BackupURL   *string `json:"backupUrl"`
	Description *string `json:"description"`
	IsPrivate   *bool   `json:"isPrivate"`
}

func (a *API) CreateLink(w http.ResponseWriter, r *http.Request) {
	var req linkReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, 400, "bad_request", "请求格式不正确")
		return
	}
	req.URL = strings.TrimSpace(req.URL)
	req.Title = strings.TrimSpace(req.Title)
	if !validURL(req.URL) {
		httpx.FailField(w, 400, "invalid_url", "URL 必须是 http 或 https 地址", "url")
		return
	}
	if req.Title == "" {
		req.Title = hostOf(req.URL)
	}
	if len([]rune(req.Title)) > 128 {
		httpx.FailField(w, 400, "invalid_name", "标题最多 128 个字符", "title")
		return
	}
	if req.CategoryID <= 0 || !a.categoryExists(req.CategoryID) {
		httpx.FailField(w, 400, "bad_request", "分类不存在", "categoryId")
		return
	}

	// Duplicate detection is scoped to the category, as designed.
	var dup int64
	if err := a.Store.DB.QueryRow(
		`SELECT COUNT(*) FROM link WHERE category_id = ? AND url = ?`, req.CategoryID, req.URL,
	).Scan(&dup); err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	if dup > 0 {
		httpx.Fail(w, 409, "duplicate_link", "该分类下已存在相同链接")
		return
	}

	catName := a.categoryName(req.CategoryID)
	desc := ""
	if req.Description != nil {
		desc = *req.Description
	}
	priv := 0
	if req.IsPrivate != nil && *req.IsPrivate {
		priv = 1
	}
	host := hostOf(req.URL)
	titleNorm := normalizeTitle(req.Title)
	search := buildSearchText(titleNorm, host, desc, catName)

	var maxSort int64
	_ = a.Store.DB.QueryRow(
		`SELECT COALESCE(MAX(sort), 0) FROM link WHERE category_id = ?`, req.CategoryID,
	).Scan(&maxSort)

	now := time.Now().UnixMilli()
	res, err := a.Store.DB.Exec(
		`INSERT INTO link(category_id, title, url, backup_url, description, sort,
		                  is_private, last_status, title_norm, host, search_text,
		                  created_at, updated_at)
		 VALUES(?,?,?,?,?,?,?,'unknown',?,?,?,?,?)`,
		req.CategoryID, req.Title, req.URL, nullable(req.BackupURL), nullable(req.Description),
		maxSort+1000, priv, titleNorm, host, search, now, now,
	)
	if err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	id, _ := res.LastInsertId()

	d, err := a.getLink(id)
	if err != nil {
		httpx.Fail(w, 500, "internal", "读取失败")
		return
	}
	httpx.JSON(w, http.StatusCreated, d)
}

func (a *API) UpdateLink(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, 404, "not_found", "链接不存在")
		return
	}
	var req struct {
		CategoryID  *int64  `json:"categoryId"`
		Title       *string `json:"title"`
		URL         *string `json:"url"`
		BackupURL   *string `json:"backupUrl"`
		Description *string `json:"description"`
		IsPrivate   *bool   `json:"isPrivate"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, 400, "bad_request", "请求格式不正确")
		return
	}

	cur, err := a.getLinkRow(id)
	if err != nil {
		httpx.Fail(w, 404, "not_found", "链接不存在")
		return
	}

	catID := cur.categoryID
	if req.CategoryID != nil {
		if !a.categoryExists(*req.CategoryID) {
			httpx.FailField(w, 400, "bad_request", "分类不存在", "categoryId")
			return
		}
		catID = *req.CategoryID
	}
	title := cur.title
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
		if title == "" {
			httpx.FailField(w, 400, "invalid_name", "标题不能为空", "title")
			return
		}
	}
	linkURL := cur.url
	if req.URL != nil {
		linkURL = strings.TrimSpace(*req.URL)
		if !validURL(linkURL) {
			httpx.FailField(w, 400, "invalid_url", "URL 必须是 http 或 https 地址", "url")
			return
		}
	}
	desc := cur.description
	if req.Description != nil {
		desc = *req.Description
	}
	priv := cur.isPrivate
	if req.IsPrivate != nil && *req.IsPrivate {
		priv = 1
	} else if req.IsPrivate != nil {
		priv = 0
	}

	host := hostOf(linkURL)
	titleNorm := normalizeTitle(title)
	search := buildSearchText(titleNorm, host, desc, a.categoryName(catID))

	_, err = a.Store.DB.Exec(
		`UPDATE link SET category_id=?, title=?, url=?, backup_url=?, description=?,
		                 is_private=?, is_sample=0, title_norm=?, host=?, search_text=?,
		                 updated_at=?
		 WHERE id=?`,
		catID, title, linkURL, nullableOrKeep(req.BackupURL, cur.backupURL),
		nullableOrString(req.Description, desc), priv,
		titleNorm, host, search, time.Now().UnixMilli(), id,
	)
	if err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	d, err := a.getLink(id)
	if err != nil {
		httpx.Fail(w, 500, "internal", "读取失败")
		return
	}
	httpx.JSON(w, 200, d)
}

func (a *API) DeleteLink(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, 404, "not_found", "链接不存在")
		return
	}
	if _, err := a.Store.DB.Exec(`DELETE FROM link WHERE id = ?`, id); err != nil {
		httpx.Fail(w, 500, "internal", "删除失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ReorderLinks(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CategoryID int64   `json:"categoryId"`
		OrderedIDs []int64 `json:"orderedIds"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, 400, "bad_request", "请求格式不正确")
		return
	}

	var existing []int64
	rows, err := a.Store.DB.Query(`SELECT id FROM link WHERE category_id = ?`, req.CategoryID)
	if err != nil {
		httpx.Fail(w, 500, "internal", "读取失败")
		return
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			httpx.Fail(w, 500, "internal", "读取失败")
			return
		}
		existing = append(existing, id)
	}
	rows.Close()

	if len(existing) != len(req.OrderedIDs) {
		httpx.Fail(w, 400, "bad_request", "排序列表必须包含该分类下全部链接")
		return
	}
	seen := map[int64]bool{}
	for _, id := range req.OrderedIDs {
		seen[id] = true
	}
	for _, id := range existing {
		if !seen[id] {
			httpx.Fail(w, 400, "bad_request", "排序列表必须包含该分类下全部链接")
			return
		}
	}

	tx, err := a.Store.DB.Begin()
	if err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	defer tx.Rollback()
	for i, id := range req.OrderedIDs {
		if _, err := tx.Exec(`UPDATE link SET sort = ? WHERE id = ? AND category_id = ?`,
			int64(i+1)*1000, id, req.CategoryID); err != nil {
			httpx.Fail(w, 500, "internal", "保存失败")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- categories ---

func (a *API) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string `json:"name"`
		ParentID  *int64 `json:"parentId"`
		IsPrivate bool   `json:"isPrivate"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, 400, "bad_request", "请求格式不正确")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len([]rune(req.Name)) > 64 {
		httpx.FailField(w, 400, "invalid_name", "名称需为 1–64 个字符", "name")
		return
	}

	var parent sql.NullInt64
	if req.ParentID != nil && *req.ParentID > 0 {
		// Only two levels are supported: the parent must itself be a root.
		var parentOf sql.NullInt64
		err := a.Store.DB.QueryRow(`SELECT parent_id FROM category WHERE id = ?`, *req.ParentID).Scan(&parentOf)
		if err != nil {
			httpx.FailField(w, 400, "bad_request", "父级分类不存在", "parentId")
			return
		}
		if parentOf.Valid {
			httpx.FailField(w, 400, "bad_request", "只支持两级分类", "parentId")
			return
		}
		parent = sql.NullInt64{Int64: *req.ParentID, Valid: true}
	}

	var maxSort int64
	if parent.Valid {
		_ = a.Store.DB.QueryRow(`SELECT COALESCE(MAX(sort),0) FROM category WHERE parent_id = ?`, parent.Int64).Scan(&maxSort)
	} else {
		_ = a.Store.DB.QueryRow(`SELECT COALESCE(MAX(sort),0) FROM category WHERE parent_id IS NULL`).Scan(&maxSort)
	}

	now := time.Now().UnixMilli()
	res, err := a.Store.DB.Exec(
		`INSERT INTO category(name, parent_id, sort, is_private, created_at, updated_at)
		 VALUES(?,?,?,?,?,?)`,
		req.Name, parent, maxSort+1000, boolInt(req.IsPrivate), now, now,
	)
	if err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	id, _ := res.LastInsertId()
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "name": req.Name})
}

func (a *API) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, 404, "not_found", "分类不存在")
		return
	}
	var req struct {
		Name      *string `json:"name"`
		ParentID  *int64  `json:"parentId"`
		IsPrivate *bool   `json:"isPrivate"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, 400, "bad_request", "请求格式不正确")
		return
	}

	var curName string
	var curParent sql.NullInt64
	if err := a.Store.DB.QueryRow(
		`SELECT name, parent_id FROM category WHERE id = ?`, id,
	).Scan(&curName, &curParent); err != nil {
		httpx.Fail(w, 404, "not_found", "分类不存在")
		return
	}

	name := curName
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			httpx.FailField(w, 400, "invalid_name", "名称不能为空", "name")
			return
		}
	}

	priv := 0
	if req.IsPrivate != nil {
		priv = boolInt(*req.IsPrivate)
	} else {
		var p int64
		_ = a.Store.DB.QueryRow(`SELECT is_private FROM category WHERE id = ?`, id).Scan(&p)
		priv = int(p)
	}

	parent := curParent
	if req.ParentID != nil {
		if *req.ParentID == 0 {
			parent = sql.NullInt64{}
		} else {
			if *req.ParentID == id {
				httpx.FailField(w, 400, "bad_request", "分类不能作为自己的父级", "parentId")
				return
			}
			var parentOf sql.NullInt64
			if err := a.Store.DB.QueryRow(
				`SELECT parent_id FROM category WHERE id = ?`, *req.ParentID,
			).Scan(&parentOf); err != nil {
				httpx.FailField(w, 400, "bad_request", "父级分类不存在", "parentId")
				return
			}
			if parentOf.Valid {
				httpx.FailField(w, 400, "bad_request", "只支持两级分类", "parentId")
				return
			}
			parent = sql.NullInt64{Int64: *req.ParentID, Valid: true}
		}
	}

	tx, err := a.Store.DB.Begin()
	if err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	defer tx.Rollback()
	if _, err := tx.Exec(
		`UPDATE category SET name=?, parent_id=?, is_private=?, is_sample=0, updated_at=? WHERE id=?`,
		name, parent, priv, time.Now().UnixMilli(), id,
	); err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	// A renamed category changes the search text of its links.
	if name != curName {
		if err := recomputeCategorySearch(tx, id, name); err != nil {
			httpx.Fail(w, 500, "internal", "保存失败")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	httpx.JSON(w, 200, map[string]any{"id": id, "name": name})
}

func (a *API) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, 404, "not_found", "分类不存在")
		return
	}

	// Collect the category and, if it is a group, its children.
	ids := []int64{id}
	var parentID sql.NullInt64
	if err := a.Store.DB.QueryRow(`SELECT parent_id FROM category WHERE id = ?`, id).Scan(&parentID); err != nil {
		httpx.Fail(w, 404, "not_found", "分类不存在")
		return
	}
	if !parentID.Valid {
		rows, err := a.Store.DB.Query(`SELECT id FROM category WHERE parent_id = ?`, id)
		if err != nil {
			httpx.Fail(w, 500, "internal", "删除失败")
			return
		}
		for rows.Next() {
			var cid int64
			if err := rows.Scan(&cid); err == nil {
				ids = append(ids, cid)
			}
		}
		rows.Close()
	}

	var linkCount int64
	for _, cid := range ids {
		var n int64
		_ = a.Store.DB.QueryRow(`SELECT COUNT(*) FROM link WHERE category_id = ?`, cid).Scan(&n)
		linkCount += n
	}

	mode := r.URL.Query().Get("links")
	if linkCount > 0 && mode == "" {
		httpx.Fail(w, 409, "link_exists_in_category", "该分类下仍有链接，请指定 links=delete 或 links=move")
		return
	}

	// Every check runs before the transaction: the pool has a single
	// connection, so any s.DB query while a tx is open deadlocks.
	var target int64
	switch mode {
	case "move":
		t, err := parseIntQuery(r, "moveToCategoryId")
		if err != nil || !a.categoryExists(t) {
			httpx.FailField(w, 400, "bad_request", "目标分类不存在", "moveToCategoryId")
			return
		}
		if containsInt64(ids, t) {
			httpx.FailField(w, 400, "bad_request", "不能移动到被删除的分类", "moveToCategoryId")
			return
		}
		target = t
	case "delete":
		// ON DELETE CASCADE removes the links.
	default:
		if linkCount > 0 {
			httpx.Fail(w, 400, "bad_request", "未知的链接处理方式")
			return
		}
	}

	tx, err := a.Store.DB.Begin()
	if err != nil {
		httpx.Fail(w, 500, "internal", "删除失败")
		return
	}
	defer tx.Rollback()

	if mode == "move" {
		for _, cid := range ids {
			if _, err := tx.Exec(`UPDATE link SET category_id = ? WHERE category_id = ?`, target, cid); err != nil {
				httpx.Fail(w, 500, "internal", "删除失败")
				return
			}
		}
	}

	for _, cid := range ids {
		if _, err := tx.Exec(`DELETE FROM category WHERE id = ?`, cid); err != nil {
			httpx.Fail(w, 500, "internal", "删除失败")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.Fail(w, 500, "internal", "删除失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- settings ---

func (a *API) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name         *string `json:"name"`
		Description  *string `json:"description"`
		Background   *string `json:"background"`
		OpenInNewTab *bool   `json:"openInNewTab"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, 400, "bad_request", "请求格式不正确")
		return
	}

	if req.Name != nil {
		v := strings.TrimSpace(*req.Name)
		if v == "" || len([]rune(v)) > 64 {
			httpx.FailField(w, 400, "invalid_name", "站点名需为 1–64 个字符", "name")
			return
		}
		_ = a.Store.SetSetting("site.name", v)
	}
	if req.Description != nil {
		_ = a.Store.SetSetting("site.description", strings.TrimSpace(*req.Description))
	}
	if req.Background != nil {
		_ = a.Store.SetSetting("site.background", strings.TrimSpace(*req.Background))
	}
	if req.OpenInNewTab != nil {
		v := "0"
		if *req.OpenInNewTab {
			v = "1"
		}
		_ = a.Store.SetSetting("link.open_in_new_tab", v)
	}

	httpx.JSON(w, 200, settingsResp{Site: a.publicSite()})
}

func (a *API) UpdateAccount(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		Username        string `json:"username"`
		NewPassword     string `json:"newPassword"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, 400, "bad_request", "请求格式不正确")
		return
	}

	var curUser, curHash string
	if err := a.Store.DB.QueryRow(`SELECT username, password_hash FROM admin WHERE id = 1`).
		Scan(&curUser, &curHash); err != nil {
		httpx.Fail(w, 500, "internal", "读取账号失败")
		return
	}
	if !authVerify(curHash, req.CurrentPassword) {
		httpx.FailField(w, 401, "bad_credentials", "当前密码不正确", "currentPassword")
		return
	}

	user := curUser
	if strings.TrimSpace(req.Username) != "" {
		user = strings.TrimSpace(req.Username)
		if len([]rune(user)) > 32 {
			httpx.FailField(w, 400, "invalid_name", "用户名最多 32 个字符", "username")
			return
		}
	}
	hash := curHash
	if req.NewPassword != "" {
		if len(req.NewPassword) < 8 {
			httpx.FailField(w, 400, "invalid_password", "密码至少 8 位", "newPassword")
			return
		}
		h, err := hashPassword(req.NewPassword)
		if err != nil {
			httpx.Fail(w, 500, "internal", "保存失败")
			return
		}
		hash = h
	}

	if _, err := a.Store.DB.Exec(
		`UPDATE admin SET username=?, password_hash=?, updated_at=? WHERE id=1`,
		user, hash, time.Now().UnixMilli(),
	); err != nil {
		httpx.Fail(w, 500, "internal", "保存失败")
		return
	}
	httpx.JSON(w, 200, map[string]any{"username": user})
}

// --- sample data ---

func (a *API) ClearSample(w http.ResponseWriter, r *http.Request) {
	res, err := a.Store.ClearSample()
	if err != nil {
		httpx.Fail(w, 500, "internal", "清理失败")
		return
	}
	httpx.JSON(w, 200, res)
}

// --- helpers ---

type linkRow struct {
	id          int64
	categoryID  int64
	title       string
	url         string
	backupURL   string
	description string
	isPrivate   int
	iconPath    string
}

func (a *API) getLinkRow(id int64) (linkRow, error) {
	var lr linkRow
	var backup, desc, icon sql.NullString
	var priv int64
	err := a.Store.DB.QueryRow(
		`SELECT id, category_id, title, url, backup_url, description, is_private, icon_path
		 FROM link WHERE id = ?`, id,
	).Scan(&lr.id, &lr.categoryID, &lr.title, &lr.url, &backup, &desc, &priv, &icon)
	lr.backupURL = backup.String
	lr.description = desc.String
	lr.iconPath = icon.String
	lr.isPrivate = int(priv)
	return lr, err
}

func (a *API) getLink(id int64) (linkDTO, error) {
	var d linkDTO
	var backup, desc, icon sql.NullString
	var priv int64
	var lastCheck sql.NullInt64
	err := a.Store.DB.QueryRow(
		`SELECT id, title, url, backup_url, description, icon_path, category_id,
		        is_private, last_status, click_count, last_checked_at
		 FROM link WHERE id = ?`, id,
	).Scan(&d.ID, &d.Title, &d.URL, &backup, &desc, &icon, &d.CategoryID,
		&priv, &d.Status, &d.ClickCount, &lastCheck)
	if err != nil {
		return d, err
	}
	d.BackupURL = nilIfEmpty(backup)
	d.Description = nilIfEmpty(desc)
	d.IconURL = iconURL(icon.String)
	d.IsPrivate = priv == 1
	d.LastCheckedAt = nilIfZero(lastCheck)
	d.CategoryName = a.categoryName(d.CategoryID)
	return d, nil
}

func (a *API) categoryExists(id int64) bool {
	var n int
	return a.Store.DB.QueryRow(`SELECT COUNT(*) FROM category WHERE id = ?`, id).Scan(&n) == nil && n > 0
}

func (a *API) categoryName(id int64) string {
	var name string
	if err := a.Store.DB.QueryRow(`SELECT name FROM category WHERE id = ?`, id).Scan(&name); err != nil {
		return ""
	}
	return name
}

func recomputeCategorySearch(tx *sql.Tx, categoryID int64, categoryName string) error {
	rows, err := tx.Query(
		`SELECT id, title, url, description FROM link WHERE category_id = ?`, categoryID)
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
		search := buildSearchText(normalizeTitle(it.title), hostOf(it.url), it.description.String, categoryName)
		if _, err := tx.Exec(`UPDATE link SET search_text = ? WHERE id = ?`, search, it.id); err != nil {
			return err
		}
	}
	return nil
}

func nullable(s *string) any {
	if s == nil {
		return nil
	}
	if strings.TrimSpace(*s) == "" {
		return nil
	}
	return *s
}

// nullableOrKeep returns the new value when the field was provided, otherwise
// keeps the current stored value.
func nullableOrKeep(newVal *string, current string) any {
	if newVal == nil {
		if current == "" {
			return nil
		}
		return current
	}
	if strings.TrimSpace(*newVal) == "" {
		return nil
	}
	return *newVal
}

func nullableOrString(newVal *string, fallback string) any {
	if newVal == nil {
		if fallback == "" {
			return nil
		}
		return fallback
	}
	if strings.TrimSpace(*newVal) == "" {
		return nil
	}
	return *newVal
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func parseIntQuery(r *http.Request, key string) (int64, error) {
	v := r.URL.Query().Get(key)
	if v == "" {
		return 0, errors.New("missing " + key)
	}
	return strconv.ParseInt(v, 10, 64)
}

func containsInt64(list []int64, v int64) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
