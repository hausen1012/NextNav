package service

import "strings"

type UpdateSettingsInput struct {
	Name              *string
	Description       *string
	Background        *string
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
	if input.Background != nil {
		_ = s.store.SetSetting("site.background", strings.TrimSpace(*input.Background))
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

func (s *Service) ClearSample() (map[string]int, error) {
	return s.store.ClearSample()
}
