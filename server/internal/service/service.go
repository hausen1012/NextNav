package service

import (
	"errors"
	"nextnav/internal/store"
)

var (
	ErrNotFound             = errors.New("not found")
	ErrDuplicateLink        = errors.New("duplicate link in category")
	ErrInvalidParent        = errors.New("invalid parent category")
	ErrBadCredentials       = errors.New("bad credentials")
	ErrAlreadyInstalled     = errors.New("already installed")
	ErrLinkExistsInCategory = errors.New("links exist in category")
	ErrInvalidReorder       = errors.New("invalid reorder list")
	ErrSubcategoriesExist   = errors.New("subcategories exist")
	ErrSelfParent           = errors.New("cannot set self as parent")
)

type Service struct {
	store *store.Store
}

func New(st *store.Store) *Service {
	return &Service{store: st}
}

func (s *Service) Store() *store.Store {
	return s.store
}

func (s *Service) DataDir() string {
	return s.store.DataDir
}
