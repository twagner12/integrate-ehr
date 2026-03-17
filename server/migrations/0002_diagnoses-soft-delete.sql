ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- Only one active instance of each ICD-10 code per client
CREATE UNIQUE INDEX IF NOT EXISTS idx_diagnoses_active_code
  ON diagnoses (client_id, icd10_code) WHERE removed_at IS NULL;
