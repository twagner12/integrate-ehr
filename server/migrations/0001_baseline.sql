-- Baseline migration: captures the live schema as of 2026-03-16.
-- If running against an existing database, skip this migration by inserting
-- a row into pgmigrations manually:
--   INSERT INTO pgmigrations (name, run_on) VALUES ('0001_baseline', now());

-- ============================================================
-- CLINICIANS
-- ============================================================
CREATE TABLE IF NOT EXISTS clinicians (
  id              SERIAL PRIMARY KEY,
  first_name      TEXT,
  last_name       TEXT,
  full_name       TEXT NOT NULL,
  npi_number      TEXT,
  license_number  TEXT,
  credentials     TEXT,
  phone           TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id                SERIAL PRIMARY KEY,
  cpt_code          TEXT NOT NULL,
  description       TEXT NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 50,
  full_rate         NUMERIC(10,2) NOT NULL,
  late_cancel_rate  NUMERIC(10,2),
  is_default        BOOLEAN NOT NULL DEFAULT false,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id                    SERIAL PRIMARY KEY,
  first_name            TEXT,
  last_name             TEXT,
  preferred_name        TEXT,
  full_name             TEXT NOT NULL,
  date_of_birth         DATE,
  status                TEXT NOT NULL DEFAULT 'Active',
  primary_clinician_id  INTEGER REFERENCES clinicians(id) ON DELETE SET NULL,
  location              TEXT DEFAULT 'In-person',
  admin_notes           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PEOPLE
-- Independent person records (parents, guardians, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS people (
  id              SERIAL PRIMARY KEY,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  phone_primary   TEXT,
  phone_secondary TEXT,
  email           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CLIENT_CONTACTS
-- Links people to clients with relationship and preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS client_contacts (
  id                          SERIAL PRIMARY KEY,
  client_id                   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  person_id                   INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  relationship                TEXT,
  is_responsible_party        BOOLEAN NOT NULL DEFAULT false,
  reminder_appointment_email  BOOLEAN NOT NULL DEFAULT true,
  reminder_appointment_text   BOOLEAN NOT NULL DEFAULT false,
  reminder_cancellation_email BOOLEAN NOT NULL DEFAULT true,
  reminder_cancellation_text  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (client_id, person_id)
);

-- ============================================================
-- DIAGNOSES
-- ============================================================
CREATE TABLE IF NOT EXISTS diagnoses (
  id            SERIAL PRIMARY KEY,
  client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  icd10_code    TEXT NOT NULL,
  description   TEXT NOT NULL,
  diagnosed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id    INTEGER NOT NULL REFERENCES clinicians(id) ON DELETE RESTRICT,
  service_id      INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  location        TEXT NOT NULL DEFAULT '1167 Wilmette Ave, Wilmette IL',
  status          TEXT NOT NULL DEFAULT 'Show',
  billing_status  TEXT NOT NULL DEFAULT 'Uninvoiced',
  fee             NUMERIC(10,2),
  memo            TEXT,
  is_recurring    BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule JSONB,
  series_id       INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_client    ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_clinician ON appointments(clinician_id);
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);

-- ============================================================
-- NOTES (SOAP)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id              SERIAL PRIMARY KEY,
  appointment_id  INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subjective      TEXT,
  objective       TEXT,
  assessment      TEXT,
  plan            TEXT,
  is_finalized    BOOLEAN NOT NULL DEFAULT false,
  finalized_at    TIMESTAMPTZ,
  unlocked_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INVOICE NUMBER SEQUENCE
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1001;

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id              SERIAL PRIMARY KEY,
  invoice_number  INTEGER NOT NULL UNIQUE DEFAULT nextval('invoice_number_seq'),
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  clinician_id    INTEGER REFERENCES clinicians(id) ON DELETE SET NULL,
  issued_date     DATE NOT NULL,
  due_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Sent',
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance         NUMERIC(10,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  footer_text     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);

-- ============================================================
-- INVOICE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_items (
  id              SERIAL PRIMARY KEY,
  invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  appointment_id  INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  service_date    DATE NOT NULL,
  description     TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  is_no_show      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ============================================================
-- CLINIC SETTINGS (singleton row)
-- ============================================================
CREATE TABLE IF NOT EXISTS clinic_settings (
  id              SERIAL PRIMARY KEY,
  practice_name   TEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  phone           TEXT,
  tax_id          TEXT,
  logo_data       TEXT,
  invoice_due_days INTEGER NOT NULL DEFAULT 15,
  invoice_footer  TEXT,
  superbill_day   INTEGER NOT NULL DEFAULT 15,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure exactly one settings row exists
INSERT INTO clinic_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================================
-- USER PROFILES
-- Per-user settings linked to Clerk auth
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id              SERIAL PRIMARY KEY,
  clerk_user_id   TEXT NOT NULL UNIQUE,
  phone           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
