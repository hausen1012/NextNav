package handler

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"nextnav/internal/httpx"
	"nextnav/internal/service"
	"nextnav/internal/store"
)

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
	IconPath    *string `json:"iconPath"`
	IconURL     *string `json:"iconUrl"`
	Sort        *int64  `json:"sort"`
	IsPrivate   *bool   `json:"isPrivate"`
}

func (a *API) CreateLink(w http.ResponseWriter, r *http.Request) {
	var req linkReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}
	req.URL = strings.TrimSpace(req.URL)
	req.Title = strings.TrimSpace(req.Title)
	if !validURL(req.URL) {
		httpx.FailField(w, http.StatusBadRequest, "invalid_url", "URL 必须是 http 或 https 地址", "url")
		return
	}
	if req.Title == "" {
		u, _ := url.Parse(req.URL)
		req.Title = strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	}
	if len([]rune(req.Title)) > 128 {
		httpx.FailField(w, http.StatusBadRequest, "invalid_name", "标题最多 128 个字符", "title")
		return
	}
	if req.CategoryID <= 0 {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "分类不存在", "categoryId")
		return
	}

	d, err := a.Service.CreateLink(service.CreateLinkInput{
		CategoryID:  req.CategoryID,
		Title:       req.Title,
		URL:         req.URL,
		BackupURL:   req.BackupURL,
		Description: req.Description,
		IconPath:    req.IconPath,
		IconURL:     req.IconURL,
		Sort:        req.Sort,
		IsPrivate:   req.IsPrivate,
	})
	if errors.Is(err, service.ErrNotFound) {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "分类不存在", "categoryId")
		return
	}
	if errors.Is(err, service.ErrInvalidIconPath) {
		httpx.FailField(w, http.StatusBadRequest, "invalid_icon", "图标文件不存在", "iconPath")
		return
	}
	if errors.Is(err, service.ErrDuplicateLink) {
		httpx.Fail(w, http.StatusConflict, "duplicate_link", "该分类下已存在相同链接")
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "保存失败")
		return
	}
	httpx.JSON(w, http.StatusCreated, d)
}

func (a *API) UpdateLink(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, http.StatusNotFound, "not_found", "链接不存在")
		return
	}
	var req struct {
		CategoryID  *int64  `json:"categoryId"`
		Title       *string `json:"title"`
		URL         *string `json:"url"`
		BackupURL   *string `json:"backupUrl"`
		Description *string `json:"description"`
		IconPath    *string `json:"iconPath"`
		IconURL     *string `json:"iconUrl"`
		Sort        *int64  `json:"sort"`
		IsPrivate   *bool   `json:"isPrivate"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}

	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			httpx.FailField(w, http.StatusBadRequest, "invalid_name", "标题不能为空", "title")
			return
		}
	}
	if req.URL != nil {
		u := strings.TrimSpace(*req.URL)
		if !validURL(u) {
			httpx.FailField(w, http.StatusBadRequest, "invalid_url", "URL 必须是 http 或 https 地址", "url")
			return
		}
	}

	// Verify link existence
	if _, err := a.Service.GetLinkDTO(id); errors.Is(err, service.ErrNotFound) {
		httpx.Fail(w, http.StatusNotFound, "not_found", "链接不存在")
		return
	}

	d, err := a.Service.UpdateLink(id, service.UpdateLinkInput{
		CategoryID:  req.CategoryID,
		Title:       req.Title,
		URL:         req.URL,
		BackupURL:   req.BackupURL,
		Description: req.Description,
		IconPath:    req.IconPath,
		IconURL:     req.IconURL,
		Sort:        req.Sort,
		IsPrivate:   req.IsPrivate,
	})
	if errors.Is(err, service.ErrNotFound) {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "分类不存在", "categoryId")
		return
	}
	if errors.Is(err, service.ErrInvalidIconPath) {
		httpx.FailField(w, http.StatusBadRequest, "invalid_icon", "图标文件不存在", "iconPath")
		return
	}
	if errors.Is(err, service.ErrDuplicateLink) {
		httpx.Fail(w, http.StatusConflict, "duplicate_link", "该分类下已存在相同链接")
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "保存失败")
		return
	}
	httpx.JSON(w, http.StatusOK, d)
}

func (a *API) DeleteLink(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, http.StatusNotFound, "not_found", "链接不存在")
		return
	}
	if err := a.Service.DeleteLink(id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			httpx.Fail(w, http.StatusNotFound, "not_found", "链接不存在")
			return
		}
		httpx.Fail(w, http.StatusInternalServerError, "internal", "删除失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- categories ---

func (a *API) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string  `json:"name"`
		ParentID    *int64  `json:"parentId"`
		Sort        *int64  `json:"sort"`
		IsPrivate   bool    `json:"isPrivate"`
		Description *string `json:"description"`
		Icon        *string `json:"icon"`
		IconPath    *string `json:"iconPath"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len([]rune(req.Name)) > 64 {
		httpx.FailField(w, http.StatusBadRequest, "invalid_name", "名称需为 1–64 个字符", "name")
		return
	}

	icon := req.Icon
	if icon == nil {
		icon = req.IconPath
	}

	id, err := a.Service.CreateCategory(service.CreateCategoryInput{
		Name:        req.Name,
		ParentID:    req.ParentID,
		Sort:        req.Sort,
		IsPrivate:   req.IsPrivate,
		Description: req.Description,
		Icon:        icon,
	})
	if errors.Is(err, service.ErrNotFound) {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "父级分类不存在", "parentId")
		return
	}
	if errors.Is(err, service.ErrInvalidParent) {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "只支持两级分类", "parentId")
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "保存失败")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "name": req.Name})
}

func (a *API) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, http.StatusNotFound, "not_found", "分类不存在")
		return
	}
	var req struct {
		Name        *string `json:"name"`
		ParentID    *int64  `json:"parentId"`
		Sort        *int64  `json:"sort"`
		IsPrivate   *bool   `json:"isPrivate"`
		Description *string `json:"description"`
		Icon        *string `json:"icon"`
		IconPath    *string `json:"iconPath"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}

	if req.Name != nil {
		n := strings.TrimSpace(*req.Name)
		if n == "" || len([]rune(n)) > 64 {
			httpx.FailField(w, http.StatusBadRequest, "invalid_name", "名称需为 1–64 个字符", "name")
			return
		}
	}

	icon := req.Icon
	if icon == nil {
		icon = req.IconPath
	}

	name, err := a.Service.UpdateCategory(id, service.UpdateCategoryInput{
		Name:        req.Name,
		ParentID:    req.ParentID,
		Sort:        req.Sort,
		IsPrivate:   req.IsPrivate,
		Description: req.Description,
		Icon:        icon,
	})
	if errors.Is(err, service.ErrNotFound) {
		if req.ParentID != nil && *req.ParentID > 0 {
			httpx.FailField(w, http.StatusBadRequest, "bad_request", "父级分类不存在", "parentId")
			return
		}
		httpx.Fail(w, http.StatusNotFound, "not_found", "分类不存在")
		return
	}
	if errors.Is(err, service.ErrSelfParent) {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "分类不能作为自己的父级", "parentId")
		return
	}
	if errors.Is(err, service.ErrSubcategoriesExist) {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "该主分类下包含子分类，无法移动为二级分类", "parentId")
		return
	}
	if errors.Is(err, service.ErrInvalidParent) {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "只支持两级分类", "parentId")
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "保存失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id, "name": name})
}

func (a *API) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r)
	if !ok {
		httpx.Fail(w, http.StatusNotFound, "not_found", "分类不存在")
		return
	}

	mode := r.URL.Query().Get("links")
	var targetID int64
	if mode == "move" {
		t, err := parseIntQuery(r, "moveToCategoryId")
		if err != nil {
			httpx.FailField(w, http.StatusBadRequest, "bad_request", "目标分类不存在", "moveToCategoryId")
			return
		}
		targetID = t
	}

	err := a.Service.DeleteCategory(id, mode, targetID)
	if errors.Is(err, service.ErrNotFound) {
		if mode == "move" {
			httpx.FailField(w, http.StatusBadRequest, "bad_request", "目标分类不存在", "moveToCategoryId")
			return
		}
		httpx.Fail(w, http.StatusNotFound, "not_found", "分类不存在")
		return
	}
	if errors.Is(err, service.ErrInvalidParent) {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "不能移动到被删除的分类", "moveToCategoryId")
		return
	}
	if errors.Is(err, service.ErrLinkExistsInCategory) {
		httpx.Fail(w, http.StatusConflict, "link_exists_in_category", "该分类下仍有链接，请指定 links=delete 或 links=move")
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "未知的链接处理方式")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- settings ---

func (a *API) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name              *string `json:"name"`
		Description       *string `json:"description"`
		Background        *string `json:"background"`
		FaviconServiceURL *string `json:"faviconServiceUrl"`
		OpenInNewTab      *bool   `json:"openInNewTab"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}

	if req.Name != nil {
		v := strings.TrimSpace(*req.Name)
		if v == "" || len([]rune(v)) > 64 {
			httpx.FailField(w, http.StatusBadRequest, "invalid_name", "站点名需为 1–64 个字符", "name")
			return
		}
	}

	site := a.Service.UpdateSettings(service.UpdateSettingsInput{
		Name:              req.Name,
		Description:       req.Description,
		Background:        req.Background,
		FaviconServiceURL: req.FaviconServiceURL,
		OpenInNewTab:      req.OpenInNewTab,
	})
	httpx.JSON(w, http.StatusOK, map[string]any{"site": site})
}

func (a *API) UpdateAccount(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		Username        string `json:"username"`
		NewPassword     string `json:"newPassword"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}

	user, err := a.Service.UpdateAccount(req.CurrentPassword, req.Username, req.NewPassword)
	if errors.Is(err, service.ErrBadCredentials) {
		httpx.FailField(w, http.StatusUnauthorized, "bad_credentials", "当前密码不正确", "currentPassword")
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "保存失败")
		return
	}
	if req.NewPassword != "" {
		a.issueSession(w, r)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"username": user})
}

// --- sample data ---

func (a *API) ClearSample(w http.ResponseWriter, r *http.Request) {
	res, err := a.Service.ClearSample()
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "清理失败")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// --- batch operations ---

func (a *API) BatchDeleteLinks(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}
	n, err := a.Service.BatchDeleteLinks(req.IDs)
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "批量删除失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int64{"deletedCount": n})
}

func (a *API) BatchMoveLinks(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs        []int64 `json:"ids"`
		CategoryID int64   `json:"categoryId"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请求格式不正确")
		return
	}
	if req.CategoryID <= 0 {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "目标分类不存在", "categoryId")
		return
	}
	n, err := a.Service.BatchMoveLinks(req.IDs, req.CategoryID)
	if errors.Is(err, service.ErrNotFound) {
		httpx.FailField(w, http.StatusBadRequest, "bad_request", "目标分类不存在", "categoryId")
		return
	}
	if errors.Is(err, service.ErrDuplicateLink) {
		httpx.Fail(w, http.StatusConflict, "duplicate_link", "目标分类下已存在相同链接")
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "批量移动失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int64{"movedCount": n})
}

// --- tokens ---

func (a *API) GetToken(w http.ResponseWriter, r *http.Request) {
	info, err := a.Service.GetTokenInfo()
	if errors.Is(err, service.ErrNotFound) || errors.Is(err, store.ErrNotFound) {
		httpx.JSON(w, http.StatusOK, map[string]any{"token": nil})
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "查询 Token 失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"token": info})
}

func (a *API) CreateToken(w http.ResponseWriter, r *http.Request) {
	raw, info, err := a.Service.GenerateToken()
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "生成 Token 失败")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"token": raw,
		"info":  info,
	})
}

func (a *API) DeleteToken(w http.ResponseWriter, r *http.Request) {
	if err := a.Service.RevokeToken(); err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "撤回 Token 失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- backup ---

func (a *API) ExportBackup(w http.ResponseWriter, r *http.Request) {
	data, err := a.Service.ExportData()
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "备份导出失败")
		return
	}
	httpx.JSON(w, http.StatusOK, data)
}

func (a *API) ImportBackup(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("mode")
	if mode != "overwrite" {
		mode = "merge"
	}
	var data store.BackupData
	if err := httpx.DecodeJSON(r, &data); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "导入文件格式不正确")
		return
	}
	res, err := a.Service.ImportData(&data, mode)
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "备份导入失败")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func parseIntQuery(r *http.Request, key string) (int64, error) {
	v := r.URL.Query().Get(key)
	if v == "" {
		return 0, errors.New("missing " + key)
	}
	return strconv.ParseInt(v, 10, 64)
}
