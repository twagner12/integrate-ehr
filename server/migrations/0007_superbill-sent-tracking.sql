-- Track when superbills have been auto-sent
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS superbill_sent_at TIMESTAMPTZ;
