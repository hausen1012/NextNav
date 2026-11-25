package handler

import (
	"errors"
	"io"
	"net/http"

	"nextnav/internal/httpx"
	"nextnav/internal/service"
)

func (a *API) UploadLogo(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024+1024)
	if err := r.ParseMultipartForm(1024 * 1024); err != nil {
		httpx.Fail(w, http.StatusBadRequest, "file_too_large", "文件大小不能超过 1MB")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.Fail(w, http.StatusBadRequest, "bad_request", "请上传文件 (file 字段)")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, 1024*1024+1))
	if len(data) > 1024*1024 {
		httpx.Fail(w, http.StatusBadRequest, "file_too_large", "文件大小不能超过 1MB")
		return
	}

	logoURL, err := a.Service.SaveLogo(data, header.Filename)
	if errors.Is(err, service.ErrInvalidImageType) {
		httpx.Fail(w, http.StatusBadRequest, "invalid_type", "仅支持 PNG、JPEG 或 WebP 格式的图片")
		return
	}
	if err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "保存 Logo 失败")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"logoUrl": logoURL})
}

func (a *API) RemoveLogo(w http.ResponseWriter, r *http.Request) {
	if err := a.Service.RemoveLogo(); err != nil {
		httpx.Fail(w, http.StatusInternalServerError, "internal", "清除 Logo 失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
