package handler

import (
	"net/http"

	"nextnav/internal/service"
)

// API holds every dependency a handler needs.
type API struct {
	Service       *service.Service
	limiter       *ipLimiter
	spaHandler    http.Handler
	faviconPolicy faviconAccessPolicy
}
