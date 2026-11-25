-- Drop unused click tracking columns
ALTER TABLE link DROP COLUMN click_count;
ALTER TABLE link DROP COLUMN last_clicked_at;
