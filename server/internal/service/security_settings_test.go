package service_test

import (
	"testing"
	"time"
)

func TestSessionTTLSettings(t *testing.T) {
	svc, st := newTestService(t)

	if got := svc.SessionTTL(); got != 720*time.Hour {
		t.Fatalf("默认会话有效期 = %v，期望 720h", got)
	}

	for _, hours := range []int{0, -1, 8761} {
		if _, err := svc.UpdateSecuritySettings(hours); err == nil {
			t.Errorf("UpdateSecuritySettings(%d) 应当拒绝越界值", hours)
		}
	}

	if _, err := svc.UpdateSecuritySettings(24); err != nil {
		t.Fatalf("更新会话有效期失败: %v", err)
	}
	if got := svc.SessionTTL(); got != 24*time.Hour {
		t.Errorf("更新后会话有效期 = %v，期望 24h", got)
	}

	if _, err := svc.UpdateSecuritySettings(720); err != nil {
		t.Fatalf("恢复默认会话有效期失败: %v", err)
	}
	if got := svc.GetSecuritySettings().SessionTTLHours; got != 720 {
		t.Errorf("恢复后配置值 = %d，期望 720", got)
	}

	if err := st.SetSetting("security.session_ttl_hours", "invalid"); err != nil {
		t.Fatalf("写入无效配置失败: %v", err)
	}
	if got := svc.SessionTTL(); got != 720*time.Hour {
		t.Errorf("无效配置应回退默认值，实际 = %v", got)
	}
}
