package service

import (
	"fmt"
	"strconv"
	"time"
)

const (
	settingSessionTTLHours = "security.session_ttl_hours"
	defaultSessionTTLHours = 30 * 24
	minSessionTTLHours     = 1
	maxSessionTTLHours     = 365 * 24
)

// SecuritySettingsDTO 是可运行时修改的账户安全参数。
type SecuritySettingsDTO struct {
	SessionTTLHours int `json:"sessionTtlHours"`
}

// GetSecuritySettings 返回当前安全设置。
func (s *Service) GetSecuritySettings() SecuritySettingsDTO {
	return SecuritySettingsDTO{SessionTTLHours: s.sessionTTLHours()}
}

// SessionTTL 返回当前会话有效期。
func (s *Service) SessionTTL() time.Duration {
	return time.Duration(s.sessionTTLHours()) * time.Hour
}

func (s *Service) sessionTTLHours() int {
	hours := s.settingInt(settingSessionTTLHours, defaultSessionTTLHours)
	if hours < minSessionTTLHours || hours > maxSessionTTLHours {
		return defaultSessionTTLHours
	}
	return hours
}

// UpdateSecuritySettings 更新安全设置并返回更新后的值。
func (s *Service) UpdateSecuritySettings(hours int) (SecuritySettingsDTO, error) {
	if hours < minSessionTTLHours || hours > maxSessionTTLHours {
		return SecuritySettingsDTO{}, fmt.Errorf("session TTL must be %d-%d hours", minSessionTTLHours, maxSessionTTLHours)
	}
	var err error
	if hours == defaultSessionTTLHours {
		err = s.store.DeleteSetting(settingSessionTTLHours)
	} else {
		err = s.store.SetSetting(settingSessionTTLHours, strconv.Itoa(hours))
	}
	if err != nil {
		return SecuritySettingsDTO{}, err
	}
	return s.GetSecuritySettings(), nil
}
