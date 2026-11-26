// Package httpx contains shared helpers: JSON encoding, error responses and
// the request-scoped auth context set by the auth middleware.
package httpx

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
)

type authKey struct{}

// AuthMethod describes how a request was authenticated.
const (
	AuthNone   = "none"
	AuthCookie = "cookie"
	AuthToken  = "token"
)

// Identity is the resolved caller for a request.
type Identity struct {
	Admin         bool
	Method        string // AuthNone | AuthCookie | AuthToken
	SessionExpiry int64
}

func (i Identity) IsAdmin() bool      { return i.Admin }
func (i Identity) IsCookieAuth() bool { return i.Method == AuthCookie }

func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, authKey{}, id)
}

func IdentityFrom(ctx context.Context) Identity {
	if v, ok := ctx.Value(authKey{}).(Identity); ok {
		return v
	}
	return Identity{Method: AuthNone}
}

// JSON writes a JSON response. Any error body already produced elsewhere.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}

// ErrorBody is the single error envelope described in docs/API.md §0.4.
type ErrorBody struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

// Fail writes a structured error. The message is user-facing and must never
// contain stack traces or SQL text.
func Fail(w http.ResponseWriter, status int, code, message string) {
	JSON(w, status, ErrorBody{Error: ErrorDetail{Code: code, Message: message}})
}

func FailField(w http.ResponseWriter, status int, code, message, field string) {
	JSON(w, status, ErrorBody{Error: ErrorDetail{Code: code, Message: message, Field: field}})
}

// DecodeJSON parses the request body with a size limit and rejects unknown
// trailing content early so handlers can assume a valid object.
func DecodeJSON(r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
