-- Ensure each link URL is unique within its category.
CREATE UNIQUE INDEX IF NOT EXISTS idx_link_category_url ON link(category_id, url);
