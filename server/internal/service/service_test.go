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
