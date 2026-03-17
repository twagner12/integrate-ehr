ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
