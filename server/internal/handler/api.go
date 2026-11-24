package handler

import (
	"net/http"

	"nextnav/internal/service"
	"nextnav/internal/store"
)

// API holds every dependency a handler needs.
type API struct {
	Service    *service.Service
	Store      *store.Store
	Secure     bool
	limiter    *ipLimiter
	spaHandler http.Handler
}
