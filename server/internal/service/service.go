package service

import (
	"errors"
	"net/http"
	"sync"

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
	cookieKeyMu sync.RWMutex
	cookieKey   []byte
	fetchPolicy FetchPolicy
	fetchClient *http.Client
}

func New(st *store.Store) *Service {
	policy := defaultFetchPolicy()
	svc := &Service{
		store:       st,
		fetchPolicy: policy,
		fetchClient: newSafeHTTPClientForPolicy(policy),
	}
	svc.initCookieKey()
	return svc
}

func (s *Service) Store() *store.Store {
	return s.store
}

func (s *Service) DataDir() string {
	return s.store.DataDir
}
