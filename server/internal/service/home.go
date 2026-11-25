package service

import (
	"path/filepath"
	"strings"

	"nextnav/internal/store"
)

// IconURL converts a stored icon path into a public URL, or returns it as-is for emoji.
func IconURL(path string) *string {
	if path == "" {
		return nil
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") || strings.HasPrefix(path, "data:") {
		return &path
	}
	if !strings.Contains(path, "/") && !strings.Contains(path, "\\") && !strings.Contains(path, ".") {
		return &path
	}
	u := "/" + strings.TrimPrefix(filepath.ToSlash(path), "/")
	return &u
}

func (s *Service) GetPublicSite() PublicSiteDTO {
	name := s.store.GetSetting("site.name", "NextNav")
	desc := s.store.GetSetting("site.description", "")
	bg := s.store.GetSetting("site.background", "")
	logo := s.store.GetSetting("site.logo_path", "")
	openNew := s.store.GetSetting("link.open_in_new_tab", "1") == "1"

	var logoURL *string
	if logo != "" {
		u := "/" + strings.TrimPrefix(filepath.ToSlash(logo), "/")
		logoURL = &u
	}

	return PublicSiteDTO{
		Name:         name,
		Description:  desc,
		Background:   bg,
		LogoURL:      logoURL,
		OpenInNewTab: openNew,
	}
}

// GetHome returns the aggregated home data containing site info and category groups.
func (s *Service) GetHome(admin bool) (HomeDTO, error) {
	groups, err := s.BuildCategoryTree(admin, true)
	if err != nil {
		return HomeDTO{}, err
	}
	return HomeDTO{
		Site:   s.GetPublicSite(),
		Groups: groups,
	}, nil
}

// BuildCategoryTree constructs a two-level category tree with optional links.
func (s *Service) BuildCategoryTree(admin, withLinks bool) ([]GroupDTO, error) {
	cats, err := s.store.ListCategories()
	if err != nil {
		return nil, err
	}

	children := map[int64][]store.Category{}
	var roots []store.Category
	for _, c := range cats {
		if c.ParentID != nil && *c.ParentID > 0 {
			children[*c.ParentID] = append(children[*c.ParentID], c)
		} else {
			roots = append(roots, c)
		}
	}

	linksByCat := map[int64][]LinkDTO{}
	if withLinks {
		allLinks, err := s.store.ListLinks(admin)
		if err != nil {
			return nil, err
		}
		for _, l := range allLinks {
			iconStr := ""
			if l.IconPath != nil {
				iconStr = *l.IconPath
			}
			linksByCat[l.CategoryID] = append(linksByCat[l.CategoryID], LinkDTO{
				ID:            l.ID,
				Title:         l.Title,
				URL:           l.URL,
				BackupURL:     l.BackupURL,
				Description:   l.Description,
				IconURL:       IconURL(iconStr),
				IconPath:      l.IconPath,
				CategoryID:    l.CategoryID,
				IsPrivate:     l.IsPrivate,
				Status:        l.LastStatus,
				Sort:          l.Sort,
				LastCheckedAt: l.LastCheckedAt,
			})
		}
	}

	visible := func(c store.Category) bool {
		return admin || !c.IsPrivate
	}

	out := make([]GroupDTO, 0, len(roots))
	for _, g := range roots {
		if !visible(g) {
			continue
		}
		iconStr := ""
		if g.IconPath != nil {
			iconStr = *g.IconPath
		}
		gd := GroupDTO{
			ID:          g.ID,
			Name:        g.Name,
			IconURL:     IconURL(iconStr),
			Icon:        g.IconPath,
			Description: g.Description,
			Sort:        g.Sort,
			Links:       append([]LinkDTO{}, linksByCat[g.ID]...),
			Categories:  []CategoryDTO{},
		}
		for _, c := range children[g.ID] {
			if !visible(c) {
				continue
			}
			cIconStr := ""
			if c.IconPath != nil {
				cIconStr = *c.IconPath
			}
			pid := g.ID
			gd.Categories = append(gd.Categories, CategoryDTO{
				ID:          c.ID,
				Name:        c.Name,
				IconURL:     IconURL(cIconStr),
				Icon:        c.IconPath,
				Description: c.Description,
				Sort:        c.Sort,
				IsPrivate:   c.IsPrivate,
				ParentID:    &pid,
				Links:       append([]LinkDTO{}, linksByCat[c.ID]...),
			})
		}
		if gd.Links == nil {
			gd.Links = []LinkDTO{}
		}
		out = append(out, gd)
	}
	return out, nil
}
