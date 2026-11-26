-- Drop unused sample-data marker columns
ALTER TABLE category DROP COLUMN is_sample;
ALTER TABLE link DROP COLUMN is_sample;
