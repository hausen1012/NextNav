package service_test

import (
	"errors"
	"testing"

	"nextnav/internal/service"
	"nextnav/internal/store"
)

func newTestService(t *testing.T) (*service.Service, *store.Store) {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return service.New(st), st
}

func TestCategoryBusinessRules(t *testing.T) {
	svc, _ := newTestService(t)

	// 1. 创建根分类
	rootID, err := svc.CreateCategory(service.CreateCategoryInput{
		Name: "主分类",
	})
	if err != nil {
		t.Fatalf("create root category: %v", err)
	}

	// 2. 创建二级分类
	childID, err := svc.CreateCategory(service.CreateCategoryInput{
		Name:     "子分类",
		ParentID: &rootID,
	})
	if err != nil {
		t.Fatalf("create child category: %v", err)
	}

	// 3. 尝试以二级分类为父级（违反两级分类限制）
	_, err = svc.CreateCategory(service.CreateCategoryInput{
		Name:     "三级分类",
		ParentID: &childID,
	})
	if !errors.Is(err, service.ErrInvalidParent) {
		t.Fatalf("expected ErrInvalidParent, got %v", err)
	}

	// 4. 尝试把自己设为父级
	_, err = svc.UpdateCategory(rootID, service.UpdateCategoryInput{
		ParentID: &rootID,
	})
	if !errors.Is(err, service.ErrSelfParent) {
		t.Fatalf("expected ErrSelfParent, got %v", err)
	}

	// 5. 拥有子分类的主分类不能降级为二级分类
	otherRootID, err := svc.CreateCategory(service.CreateCategoryInput{
		Name: "另一个主分类",
	})
	if err != nil {
		t.Fatalf("create other root: %v", err)
	}

	_, err = svc.UpdateCategory(rootID, service.UpdateCategoryInput{
		ParentID: &otherRootID,
	})
	if !errors.Is(err, service.ErrSubcategoriesExist) {
		t.Fatalf("expected ErrSubcategoriesExist, got %v", err)
	}
}

func TestLinkBusinessRules(t *testing.T) {
	svc, _ := newTestService(t)

	catID, err := svc.CreateCategory(service.CreateCategoryInput{
		Name: "技术资源",
	})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}

	// 1. 创建链接
	link, err := svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID,
		Title:      "GitHub",
		URL:        "https://github.com",
	})
	if err != nil {
		t.Fatalf("create link: %v", err)
	}
	if link.CategoryName != "技术资源" {
		t.Errorf("expected CategoryName '技术资源', got %s", link.CategoryName)
	}

	// 2. 相同分类下重复链接应报错
	_, err = svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID,
		Title:      "GitHub 镜像",
		URL:        "https://github.com",
	})
	if !errors.Is(err, service.ErrDuplicateLink) {
		t.Fatalf("expected ErrDuplicateLink, got %v", err)
	}

}

func TestLinkIconRules(t *testing.T) {
	svc, st := newTestService(t)

	catID, err := svc.CreateCategory(service.CreateCategoryInput{Name: "图标测试"})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}

	// 未保存过的路径一律拒绝，防止数据库引用任意文件
	missing := "icons/ab/cd/0000000000000000.png"
	_, err = svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID,
		Title:      "Bad Icon",
		URL:        "https://example.com/bad",
		IconPath:   &missing,
	})
	if !errors.Is(err, service.ErrInvalidIconPath) {
		t.Fatalf("expected ErrInvalidIconPath on create, got %v", err)
	}

	link, err := svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID,
		Title:      "Good",
		URL:        "https://example.com/good",
	})
	if err != nil {
		t.Fatalf("create link: %v", err)
	}

	// 上传后可写入，且 source 记为 upload
	updated, err := svc.SaveLinkIconUpload(link.ID, samplePNG, "icon.png")
	if err != nil {
		t.Fatalf("save icon upload: %v", err)
	}
	if updated.IconPath == nil || *updated.IconPath == "" || updated.IconURL == nil {
		t.Fatalf("expected icon path/url, got %+v", updated)
	}

	// 改 URL 时未传 iconPath，图标保持不变
	otherURL := "https://example.com/good2"
	kept, err := svc.UpdateLink(link.ID, service.UpdateLinkInput{URL: &otherURL})
	if err != nil {
		t.Fatalf("update link: %v", err)
	}
	if kept.IconPath == nil || *kept.IconPath != *updated.IconPath {
		t.Fatalf("icon should be preserved, got %v", kept.IconPath)
	}

	// 清空后文件被回收
	cleared, err := svc.SetLinkIcon(link.ID, nil)
	if err != nil {
		t.Fatalf("clear icon: %v", err)
	}
	if cleared.IconURL != nil {
		t.Fatalf("expected nil iconUrl after clear, got %v", cleared.IconURL)
	}
	if n, err := st.CountIconReferences(*updated.IconPath); err != nil || n != 0 {
		t.Fatalf("expected 0 references after clear, got %d err=%v", n, err)
	}
}

func TestDefaultSortAndOrder(t *testing.T) {
	svc, st := newTestService(t)

	// 1. 验证分类默认排序为 10
	catID1, err := svc.CreateCategory(service.CreateCategoryInput{Name: "分类1"})
	if err != nil {
		t.Fatalf("create category 1: %v", err)
	}
	cat1, err := st.GetCategory(catID1)
	if err != nil {
		t.Fatalf("get category 1: %v", err)
	}
	if cat1.Sort != 10 {
		t.Errorf("expected cat1 sort 10, got %d", cat1.Sort)
	}

	catID2, err := svc.CreateCategory(service.CreateCategoryInput{Name: "分类2"})
	if err != nil {
		t.Fatalf("create category 2: %v", err)
	}
	cat2, err := st.GetCategory(catID2)
	if err != nil {
		t.Fatalf("get category 2: %v", err)
	}
	if cat2.Sort != 10 {
		t.Errorf("expected cat2 sort 10, got %d", cat2.Sort)
	}

	// 验证同排序下分类按添加先后顺序排布
	cats, err := st.ListCategories()
	if err != nil {
		t.Fatalf("list categories: %v", err)
	}
	if len(cats) < 2 || cats[0].ID != catID1 || cats[1].ID != catID2 {
		t.Errorf("expected category order [cat1, cat2], got %#v", cats)
	}

	// 2. 验证链接默认排序为 10
	link1, err := svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID1,
		Title:      "站点1",
		URL:        "https://example.com/1",
	})
	if err != nil {
		t.Fatalf("create link 1: %v", err)
	}
	if link1.Sort != 10 {
		t.Errorf("expected link1 sort 10, got %d", link1.Sort)
	}

	link2, err := svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID1,
		Title:      "站点2",
		URL:        "https://example.com/2",
	})
	if err != nil {
		t.Fatalf("create link 2: %v", err)
	}
	if link2.Sort != 10 {
		t.Errorf("expected link2 sort 10, got %d", link2.Sort)
	}

	// 验证同排序下链接按添加先后顺序排布
	links, err := st.ListLinks(true)
	if err != nil {
		t.Fatalf("list links: %v", err)
	}
	if len(links) < 2 || links[0].ID != link1.ID || links[1].ID != link2.ID {
		t.Errorf("expected link order [link1, link2], got %#v", links)
	}
}

func TestSampleSortValuesUnder100(t *testing.T) {
	_, st := newTestService(t)

	if err := st.SeedSample(); err != nil {
		t.Fatalf("seed sample: %v", err)
	}

	cats, err := st.ListCategories()
	if err != nil {
		t.Fatalf("list categories: %v", err)
	}
	for _, c := range cats {
		if c.Sort >= 100 {
			t.Errorf("category %q has sort %d, expected < 100", c.Name, c.Sort)
		}
	}

	links, err := st.ListLinks(true)
	if err != nil {
		t.Fatalf("list links: %v", err)
	}
	for _, l := range links {
		if l.Sort >= 100 {
			t.Errorf("link %q has sort %d, expected < 100", l.Title, l.Sort)
		}
	}
}

func TestCleanDomain(t *testing.T) {
	cases := []struct {
		input    string
		expected string
		wantErr  bool
	}{
		{"www.baidu.com", "www.baidu.com", false},
		{"https://www.baidu.com/some/path", "www.baidu.com", false},
		{"http://github.com:8080", "github.com:8080", false},
		{"sub.domain.org/", "sub.domain.org", false},
		{"   ", "", true},
		{"invalid space.com", "", true},
	}

	for _, c := range cases {
		got, err := service.CleanDomain(c.input)
		if c.wantErr && err == nil {
			t.Errorf("expected error for %q, got %q", c.input, got)
		} else if !c.wantErr && err != nil {
			t.Errorf("unexpected error for %q: %v", c.input, err)
		} else if !c.wantErr && got != c.expected {
			t.Errorf("CleanDomain(%q) = %q, expected %q", c.input, got, c.expected)
		}
	}
}

func TestLinkWithCustomIconURL(t *testing.T) {
	svc, st := newTestService(t)

	catID, err := svc.CreateCategory(service.CreateCategoryInput{
		Name: "分类",
	})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}

	// 1. 创建带网络图片链接 (iconUrl) 的 Link
	iconURL := "https://example.com/logo.png"
	link1, err := svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID,
		Title:      "站点1",
		URL:        "https://example.com/1",
		IconURL:    &iconURL,
	})
	if err != nil {
		t.Fatalf("create link with url icon: %v", err)
	}
	if link1.IconURL == nil || *link1.IconURL != iconURL {
		t.Errorf("expected iconUrl %q, got %#v", iconURL, link1.IconURL)
	}
	if link1.CustomIconURL == nil || *link1.CustomIconURL != iconURL {
		t.Errorf("expected customIconUrl %q, got %#v", iconURL, link1.CustomIconURL)
	}
	if link1.IconPath != nil {
		t.Errorf("expected nil iconPath, got %#v", link1.IconPath)
	}

	// 验证首页聚合数据 (GetHome) 能正确携带外部地址 IconURL
	homeData, err := svc.GetHome(true)
	if err != nil {
		t.Fatalf("get home: %v", err)
	}
	foundLink := false
	for _, g := range homeData.Groups {
		for _, l := range g.Links {
			if l.ID == link1.ID {
				foundLink = true
				if l.IconURL == nil || *l.IconURL != iconURL {
					t.Errorf("home link IconURL expected %q, got %#v", iconURL, l.IconURL)
				}
			}
		}
	}
	if !foundLink {
		t.Errorf("link1 not found in home groups")
	}

	// 2. 模拟上传本地图标，此时优先展示本地图标，但 customIconUrl 依然保留
	uploadedPath, err := svc.SaveIconContent([]byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
		0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
		0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
		0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
		0x42, 0x60, 0x82,
	}, "test.png")
	if err != nil {
		t.Fatalf("save icon content: %v", err)
	}

	linkWithBoth, err := svc.UpdateLink(link1.ID, service.UpdateLinkInput{
		IconPath: &uploadedPath,
	})
	if err != nil {
		t.Fatalf("update link with iconPath: %v", err)
	}
	expectedLocalURL := "/" + uploadedPath
	if linkWithBoth.IconURL == nil || *linkWithBoth.IconURL != expectedLocalURL {
		t.Errorf("expected local icon %q, got %#v", expectedLocalURL, linkWithBoth.IconURL)
	}
	if linkWithBoth.CustomIconURL == nil || *linkWithBoth.CustomIconURL != iconURL {
		t.Errorf("expected customIconUrl preserved %q, got %#v", iconURL, linkWithBoth.CustomIconURL)
	}

	// 3. 删除本地图标后，自动回退展示 customIconUrl
	clearedLocal, err := svc.SetLinkIcon(link1.ID, nil)
	if err != nil {
		t.Fatalf("clear local icon: %v", err)
	}
	if clearedLocal.IconURL == nil || *clearedLocal.IconURL != iconURL {
		t.Errorf("expected fallback to customIconUrl %q, got %#v", iconURL, clearedLocal.IconURL)
	}
	if clearedLocal.IconPath != nil {
		t.Errorf("expected nil iconPath, got %#v", clearedLocal.IconPath)
	}

	// 4. 验证删除时不会报错
	if err := svc.DeleteLink(link1.ID); err != nil {
		t.Fatalf("delete link: %v", err)
	}

	_ = st
}

func TestFaviconCache(t *testing.T) {
	_, st := newTestService(t)

	// 写入缓存并读取
	err := st.SetFaviconCache("www.baidu.com", "icons/ab/cd/test.png")
	if err != nil {
		t.Fatalf("set favicon cache: %v", err)
	}

	cached, err := st.GetFaviconCache("www.baidu.com")
	if err != nil {
		t.Fatalf("get favicon cache: %v", err)
	}
	if cached != "icons/ab/cd/test.png" {
		t.Errorf("expected 'icons/ab/cd/test.png', got %q", cached)
	}

	// 检查引用计数
	count, err := st.CountIconReferences("icons/ab/cd/test.png")
	if err != nil {
		t.Fatalf("count icon references: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 reference from favicon_cache, got %d", count)
	}
}

func TestFormatFaviconURLAndExtractDomain(t *testing.T) {
	// 测试 ExtractDomain
	tests := []struct {
		rawURL string
		expect string
	}{
		{"https://www.amjun.com", "www.amjun.com"},
		{"http://github.com/nextnav/web", "github.com"},
		{"baidu.com", "baidu.com"},
		{"https://sub.domain.co.uk:8080/path?query=1", "sub.domain.co.uk"},
		{"", ""},
	}
	for _, tt := range tests {
		got := service.ExtractDomain(tt.rawURL)
		if got != tt.expect {
			t.Errorf("ExtractDomain(%q) = %q, want %q", tt.rawURL, got, tt.expect)
		}
	}

	// 测试 FormatFaviconURL
	fmtTests := []struct {
		template string
		domain   string
		expect   string
	}{
		{"https://a.favicon.im/", "www.amjun.com", "https://a.favicon.im/www.amjun.com"},
		{"https://a.favicon.im", "www.amjun.com", "https://a.favicon.im/www.amjun.com"},
		{"https://nav.amjun.com/api/favicon/{domain}.png", "www.amjun.com", "https://nav.amjun.com/api/favicon/www.amjun.com.png"},
		{"/api/favicon/{domain}.png", "baidu.com", "/api/favicon/baidu.com.png"},
		{"https://favicon.splitbee.io/?url={domain}", "v2ex.com", "https://favicon.splitbee.io/?url=v2ex.com"},
		{"", "v2ex.com", ""},
	}
	for _, tt := range fmtTests {
		got := service.FormatFaviconURL(tt.template, tt.domain)
		if got != tt.expect {
			t.Errorf("FormatFaviconURL(%q, %q) = %q, want %q", tt.template, tt.domain, got, tt.expect)
		}
	}
}

func TestFaviconServicePriority(t *testing.T) {
	svc, _ := newTestService(t)

	// 配置全局 Favicon 服务
	favURL := "https://a.favicon.im/{domain}"
	svc.UpdateSettings(service.UpdateSettingsInput{
		FaviconServiceURL: &favURL,
	})

	catID, err := svc.CreateCategory(service.CreateCategoryInput{Name: "测试分类"})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}

	// 1. 无上传、无单独外链 -> 应走全局 Favicon 服务拼接
	l1, err := svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID,
		Title:      "站点1",
		URL:        "https://www.amjun.com/index.html",
	})
	if err != nil {
		t.Fatalf("create link 1: %v", err)
	}
	if l1.IconURL == nil || *l1.IconURL != "https://a.favicon.im/www.amjun.com" {
		t.Fatalf("expected global favicon URL 'https://a.favicon.im/www.amjun.com', got %v", l1.IconURL)
	}

	// 2. 单独配置了图标链接 (CustomIconURL) -> 应覆盖全局 Favicon 服务
	customURL := "https://custom.icon.png"
	l2, err := svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID,
		Title:      "站点2",
		URL:        "https://www.amjun.com/page2",
		IconURL:    &customURL,
	})
	if err != nil {
		t.Fatalf("create link 2: %v", err)
	}
	if l2.IconURL == nil || *l2.IconURL != customURL {
		t.Fatalf("expected custom icon URL %q, got %v", customURL, l2.IconURL)
	}

	// 3. 上传了本地图标 (IconPath) -> 最高优先级
	relPath, err := svc.SaveIconContent([]byte("fake image data"), "icon.png")
	if err != nil {
		t.Fatalf("save icon content: %v", err)
	}
	l3, err := svc.CreateLink(service.CreateLinkInput{
		CategoryID: catID,
		Title:      "站点3",
		URL:        "https://www.amjun.com/page3",
		IconPath:   &relPath,
		IconURL:    &customURL,
	})
	if err != nil {
		t.Fatalf("create link 3: %v", err)
	}
	if l3.IconURL == nil || *l3.IconURL != "/"+relPath {
		t.Fatalf("expected local icon path '/%s', got %v", relPath, l3.IconURL)
	}
}
