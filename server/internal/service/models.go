package service

type LinkDTO struct {
	ID            int64   `json:"id"`
	Title         string  `json:"title"`
	URL           string  `json:"url"`
	BackupURL     *string `json:"backupUrl"`
	Description   *string `json:"description"`
	IconURL       *string `json:"iconUrl"`
	IconPath      *string `json:"iconPath"`
	CustomIconURL *string `json:"customIconUrl,omitempty"`
	CategoryID    int64   `json:"categoryId"`
	CategoryName  string  `json:"categoryName,omitempty"`
	IsPrivate     bool    `json:"isPrivate"`
	Status        string  `json:"status"`
	Sort          int64   `json:"sort"`
	LastCheckedAt *int64  `json:"lastCheckedAt"`
	MatchedField  string  `json:"matchedField,omitempty"`
}

type CategoryDTO struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	IconURL     *string   `json:"iconUrl"`
	Icon        *string   `json:"icon,omitempty"`
	Description *string   `json:"description,omitempty"`
	Sort        int64     `json:"sort"`
	IsPrivate   bool      `json:"isPrivate"`
	Links       []LinkDTO `json:"links"`
	ParentID    *int64    `json:"parentId,omitempty"`
}

type GroupDTO struct {
	ID          int64         `json:"id"`
	Name        string        `json:"name"`
	IconURL     *string       `json:"iconUrl"`
	Icon        *string       `json:"icon,omitempty"`
	Description *string       `json:"description,omitempty"`
	Sort        int64         `json:"sort"`
	Links       []LinkDTO     `json:"links"`
	Categories  []CategoryDTO `json:"categories"`
}

type PublicSiteDTO struct {
	Name              string  `json:"name"`
	Description       string  `json:"description"`
	Background        string  `json:"background"`
	LogoURL           *string `json:"logoUrl"`
	OpenInNewTab      bool    `json:"openInNewTab"`
	FaviconServiceURL string  `json:"faviconServiceUrl"`
}

type HomeDTO struct {
	Site   PublicSiteDTO `json:"site"`
	Groups []GroupDTO    `json:"groups"`
}
