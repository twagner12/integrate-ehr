-- Add clerk_user_id to people table for portal login resolution
ALTER TABLE people ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_people_clerk_user_id ON people(clerk_user_id);

-- Add cpt_code to invoice_items for superbill generation
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS cpt_code TEXT;
