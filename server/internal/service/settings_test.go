package service_test

import (
	"testing"

	"nextnav/internal/service"
)

func TestSiteBrandTextSetting(t *testing.T) {
	svc, _ := newTestService(t)

	if got := svc.GetPublicSite().BrandText; got != "极简个人导航系统" {
		t.Fatalf("默认品牌文案 = %q，期望 %q", got, "极简个人导航系统")
	}

	brandText := "我的专属导航"
	svc.UpdateSettings(service.UpdateSettingsInput{BrandText: &brandText})

	if got := svc.GetPublicSite().BrandText; got != brandText {
		t.Errorf("更新后品牌文案 = %q，期望 %q", got, brandText)
	}
}

func TestSiteBackgroundLightAndDark(t *testing.T) {
	svc, _ := newTestService(t)

	light, dark := "#ffffff", "#0f1114"
	svc.UpdateSettings(service.UpdateSettingsInput{
		BackgroundLight: &light,
		BackgroundDark:  &dark,
	})

	site := svc.GetPublicSite()
	if site.BackgroundLight != light {
		t.Errorf("亮色背景 = %q，期望 %q", site.BackgroundLight, light)
	}
	if site.BackgroundDark != dark {
		t.Errorf("暗色背景 = %q，期望 %q", site.BackgroundDark, dark)
	}
}
