package service

import (
	"errors"
	"net/http"
	"time"

	"nextnav/internal/store"
)

var (
	ErrNotFound             = errors.New("not found")
	ErrDuplicateLink        = errors.New("duplicate link in category")
	ErrInvalidParent        = errors.New("invalid parent category")
	ErrBadCredentials       = errors.New("bad credentials")
	ErrLinkExistsInCategory = errors.New("links exist in category")
	ErrSubcategoriesExist   = errors.New("subcategories exist")
	ErrSelfParent           = errors.New("cannot set self as parent")
	ErrAlreadyRunning       = errors.New("already running")
	ErrInvalidIconPath      = errors.New("invalid icon path")
)

type Service struct {
	store       *store.Store
	cookieKey   []byte
	fetchClient *http.Client
}

func New(st *store.Store, cookieSecret ...string) *Service {
	svc := &Service{
		store:       st,
		fetchClient: newSafeHTTPClient(4 * time.Second),
	}
	sec := ""
	if len(cookieSecret) > 0 {
		sec = cookieSecret[0]
	}
	svc.initCookieKey(sec)
	return svc
}

func (s *Service) Store() *store.Store {
	return s.store
}

func (s *Service) DataDir() string {
	return s.store.DataDir
}
