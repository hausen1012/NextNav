package service

import "strings"

type UpdateSettingsInput struct {
	Name              *string
	Description       *string
	BrandText         *string
	BackgroundLight   *string
	BackgroundDark    *string
	FaviconServiceURL *string
	OpenInNewTab      *bool
}

func (s *Service) UpdateSettings(input UpdateSettingsInput) PublicSiteDTO {
	if input.Name != nil {
		_ = s.store.SetSetting("site.name", strings.TrimSpace(*input.Name))
	}
	if input.Description != nil {
		_ = s.store.SetSetting("site.description", strings.TrimSpace(*input.Description))
	}
	if input.BrandText != nil {
		_ = s.store.SetSetting("site.brand_text", strings.TrimSpace(*input.BrandText))
	}
	if input.BackgroundLight != nil {
		_ = s.store.SetSetting("site.backgroundLight", strings.TrimSpace(*input.BackgroundLight))
	}
	if input.BackgroundDark != nil {
		_ = s.store.SetSetting("site.backgroundDark", strings.TrimSpace(*input.BackgroundDark))
	}
	if input.FaviconServiceURL != nil {
		_ = s.store.SetSetting("site.favicon_service_url", strings.TrimSpace(*input.FaviconServiceURL))
	}
	if input.OpenInNewTab != nil {
		v := "0"
		if *input.OpenInNewTab {
			v = "1"
		}
		_ = s.store.SetSetting("link.open_in_new_tab", v)
	}
	return s.GetPublicSite()
}
