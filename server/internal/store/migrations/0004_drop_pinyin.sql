-- Drop unused pinyin columns
ALTER TABLE link DROP COLUMN pinyin_full;
ALTER TABLE link DROP COLUMN pinyin_short;
