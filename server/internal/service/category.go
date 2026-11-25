package service

import (
	"errors"
	"nextnav/internal/store"
	"strings"
)

type CreateCategoryInput struct {
	Name        string
	ParentID    *int64
	Sort        *int64
	IsPrivate   bool
	Description *string
	Icon        *string
}

func (s *Service) CreateCategory(input CreateCategoryInput) (int64, error) {
	var parentID *int64
	if input.ParentID != nil && *input.ParentID > 0 {
		parent, err := s.store.GetCategory(*input.ParentID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				return 0, ErrNotFound
			}
			return 0, err
		}
		if parent.ParentID != nil {
			return 0, ErrInvalidParent
		}
		parentID = input.ParentID
	}

	var sortVal int64 = 10
	if input.Sort != nil {
		sortVal = *input.Sort
	}

	c := &store.Category{
		Name:        input.Name,
		IconPath:    input.Icon,
		ParentID:    parentID,
		Sort:        sortVal,
		IsPrivate:   input.IsPrivate,
		Description: input.Description,
	}
	return s.store.CreateCategory(c)
}

type UpdateCategoryInput struct {
	Name        *string
	ParentID    *int64
	Sort        *int64
	IsPrivate   *bool
	Description *string
	Icon        *string
}

func (s *Service) UpdateCategory(id int64, input UpdateCategoryInput) (string, error) {
	cur, err := s.store.GetCategory(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return "", ErrNotFound
		}
		return "", err
	}

	name := cur.Name
	if input.Name != nil {
		name = strings.TrimSpace(*input.Name)
	}

	priv := cur.IsPrivate
	if input.IsPrivate != nil {
		priv = *input.IsPrivate
	}

	sortVal := cur.Sort
	if input.Sort != nil {
		sortVal = *input.Sort
	}

	desc := cur.Description
	if input.Description != nil {
		desc = input.Description
	}

	icon := cur.IconPath
	if input.Icon != nil {
		icon = input.Icon
	}

	parentID := cur.ParentID
	if input.ParentID != nil {
		if *input.ParentID <= 0 {
			parentID = nil
		} else {
			if *input.ParentID == id {
				return "", ErrSelfParent
			}
			childCount, err := s.store.GetCategoryChildrenCount(id)
			if err != nil {
				return "", err
			}
			if childCount > 0 {
				return "", ErrSubcategoriesExist
			}
			parent, err := s.store.GetCategory(*input.ParentID)
			if err != nil {
				if errors.Is(err, store.ErrNotFound) {
					return "", ErrNotFound
				}
				return "", err
			}
			if parent.ParentID != nil {
				return "", ErrInvalidParent
			}
			parentID = input.ParentID
		}
	}

	renameLinks := name != cur.Name
	c := &store.Category{
		ID:          id,
		Name:        name,
		IconPath:    icon,
		ParentID:    parentID,
		Sort:        sortVal,
		IsPrivate:   priv,
		Description: desc,
	}
	if err := s.store.UpdateCategory(c, renameLinks); err != nil {
		return "", err
	}
	return name, nil
}

func (s *Service) DeleteCategory(id int64, mode string, targetID int64) error {
	ids, err := s.store.GetCategoryFamilyIDs(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}

	linkCount, err := s.store.CountLinksByCategories(ids)
	if err != nil {
		return err
	}

	if linkCount > 0 && mode == "" {
		return ErrLinkExistsInCategory
	}

	switch mode {
	case "move":
		exists, err := s.store.CategoryExists(targetID)
		if err != nil || !exists {
			return ErrNotFound
		}
		for _, cid := range ids {
			if cid == targetID {
				return ErrInvalidParent
			}
		}
	case "delete":
		// Cascades
	default:
		if linkCount > 0 {
			return errors.New("unknown link handling mode")
		}
	}

	return s.store.DeleteCategory(ids, mode, targetID)
}

