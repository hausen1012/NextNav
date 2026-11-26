package auth

import (
	"testing"
	"time"
)

func TestVerifySessionReturnsExpiry(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	expiresAt := time.Now().Add(time.Hour).Truncate(time.Second)
	token := SignSession(key, expiresAt, "admin")

	subject, gotExpiry, ok := VerifySession(key, token)
	if !ok {
		t.Fatal("会话应通过校验")
	}
	if subject != "admin" {
		t.Fatalf("主体 = %q，期望 admin", subject)
	}
	if !gotExpiry.Equal(expiresAt) {
		t.Fatalf("到期时间 = %v，期望 %v", gotExpiry, expiresAt)
	}
}

func TestVerifySessionRejectsExpiredToken(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	token := SignSession(key, time.Now().Add(-time.Second), "admin")

	if _, _, ok := VerifySession(key, token); ok {
		t.Fatal("过期会话不应通过校验")
	}
}
