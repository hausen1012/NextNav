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

	// 3. 排序重组部分缺失报错
	err = svc.ReorderLinks(catID, []int64{9999})
	if !errors.Is(err, service.ErrInvalidReorder) {
		t.Fatalf("expected ErrInvalidReorder, got %v", err)
	}
}
