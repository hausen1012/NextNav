package handler

import (
	"errors"
	"net/http"
	"strconv"

	"nextnav/internal/httpx"
	"nextnav/internal/service"
	"nextnav/internal/slogx"
)

// CheckAll triggers a background health check across all links.
func (a *API) CheckAll(w http.ResponseWriter, r *http.Request) {
	total, err := a.Service.StartCheckAll()
	if err != nil {
		if errors.Is(err, service.ErrAlreadyRunning) {
			httpx.Fail(w, http.StatusConflict, "already_running", "健康检测已在运行中")
			return
		}
		slogx.Error("启动全站健康检测失败", "err", err)
		httpx.Fail(w, http.StatusInternalServerError, "internal", "启动全站检测失败")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"started": true,
		"total":   total,
	})
}

// GetCheckStatus returns current progress of background check.
func (a *API) GetCheckStatus(w http.ResponseWriter, r *http.Request) {
	st := a.Service.GetCheckStatus()
	httpx.JSON(w, http.StatusOK, st)
}

// ListChecks lists links health records for the checks list view.
func (a *API) ListChecks(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := q.Get("status")

	var categoryID *int64
	if catStr := q.Get("categoryId"); catStr != "" {
		if cid, err := strconv.ParseInt(catStr, 10, 64); err == nil && cid > 0 {
			categoryID = &cid
		}
	}

	page := 1
	if pStr := q.Get("page"); pStr != "" {
		if p, err := strconv.Atoi(pStr); err == nil && p >= 1 {
			page = p
		}
	}

	pageSize := 50
	if psStr := q.Get("pageSize"); psStr != "" {
		if ps, err := strconv.Atoi(psStr); err == nil && ps >= 1 && ps <= 200 {
			pageSize = ps
		}
	}

	items, total, err := a.Service.ListChecks(status, categoryID, page, pageSize)
	if err != nil {
		slogx.Error("获取检测记录失败", "err", err)
		httpx.Fail(w, http.StatusInternalServerError, "internal", "获取检测记录失败")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}
