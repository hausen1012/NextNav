package service

import "nextnav/internal/store"

func (s *Service) ExportData() (*store.BackupData, error) {
	return s.store.ExportData()
}

func (s *Service) ImportData(data *store.BackupData, mode string) (*store.ImportResult, error) {
	if mode != "overwrite" {
		mode = "merge"
	}
	return s.store.ImportData(data, mode)
}
