package handler

import (
	"net/http"

	"nextnav/internal/httpx"
	"nextnav/internal/slogx"
)

func (a *API) FetchMeta(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil || req.URL == "" {
		httpx.Fail(w, http.StatusBadRequest, "invalid_url", "URL 不能为空")
		return
	}

	res, err := a.Service.FetchMeta(req.URL)
	if err != nil {
		slogx.Warn("获取网站信息接口失败", "url", req.URL, "err", err)
		httpx.Fail(w, http.StatusBadRequest, "invalid_url", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, res)
}
