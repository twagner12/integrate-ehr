-- ============================================================
-- Integrate EHR - Phase 1 Schema
-- ============================================================

-- ============================================================
-- CLINICIANS
-- Staff members who provide services
-- ============================================================
CREATE TABLE clinicians (
  id            SERIAL PRIMARY KEY,
  full_name     TEXT NOT NULL,
  npi           TEXT,                    -- National Provider Identifier
  license       TEXT,                    -- CCC-SLP license number
  phone         TEXT,
  clerk_user_id TEXT UNIQUE,             -- Links to Clerk auth account
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SERVICES
-- Billable service types (CPT codes)
-- ============================================================
CREATE TABLE services (
  id                SERIAL PRIMARY KEY,
  cpt_code          TEXT NOT NULL UNIQUE,
  description       TEXT NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 50,
  full_rate         NUMERIC(10,2) NOT NULL,
  late_cancel_rate  NUMERIC(10,2),
  is_default        BOOLEAN NOT NULL DEFAULT false,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one service can be the default
CREATE UNIQUE INDEX one_default_service ON services (is_default) WHERE is_default = true;

-- Junction table: which clinicians offer which services
CREATE TABLE clinician_services (
  clinician_id  INTEGER NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  service_id    INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (clinician_id, service_id)
);

-- ============================================================
-- CLIENTS
-- The children receiving services
-- ============================================================
CREATE TABLE clients (
  id                  SERIAL PRIMARY KEY,
  full_name           TEXT NOT NULL,
  date_of_birth       DATE,
  status              TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  primary_clinician_id INTEGER REFERENCES clinicians(id) ON DELETE SET NULL,
  admin_notes         TEXT,              -- Internal only, not visible to parents
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Junction table: clients can have multiple clinicians
CREATE TABLE client_clinicians (
  client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id  INTEGER NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, clinician_id)
);

-- ============================================================
-- CONTACTS
-- Parents, guardians, and responsible parties for each client
-- ============================================================
CREATE TABLE contacts (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  relationship        TEXT,              -- e.g. "Mother", "Father", "Guardian"
  phone_primary       TEXT,
  phone_secondary     TEXT,
  email               TEXT,
  is_responsible_party BOOLEAN NOT NULL DEFAULT false,  -- Billing contact
  reminders_enabled   BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DIAGNOSES
-- ICD-10 diagnosis codes assigned at the client level
-- ============================================================
CREATE TABLE diagnoses (
  id            SERIAL PRIMARY KEY,
  client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  icd10_code    TEXT NOT NULL,
  description   TEXT NOT NULL,
  diagnosed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT,                   -- Treatment plan narrative
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- APPOINTMENTS
-- Individual scheduled sessions
-- ============================================================
CREATE TABLE appointments (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id    INTEGER NOT NULL REFERENCES clinicians(id) ON DELETE RESTRICT,
  service_id      INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  location        TEXT NOT NULL DEFAULT '1167 Wilmette Ave, Wilmette IL',
  status          TEXT NOT NULL DEFAULT 'Show'
                    CHECK (status IN ('Show', 'No Show', 'Late Cancel', 'Canceled')),
  billing_status  TEXT NOT NULL DEFAULT 'Uninvoiced'
                    CHECK (billing_status IN ('Uninvoiced', 'Invoiced', 'Paid')),
  fee             NUMERIC(10,2),        -- Actual fee charged (may differ from service rate)
  memo            TEXT,                 -- Internal note for this session
  recurring_series_id INTEGER,          -- Groups recurring appointments together
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_client    ON appointments(client_id);
CREATE INDEX idx_appointments_clinician ON appointments(clinician_id);
CREATE INDEX idx_appointments_starts_at ON appointments(starts_at);

-- ============================================================
-- SOAP NOTES
-- Clinical notes linked to appointments
-- ============================================================
CREATE TABLE notes (
  id              SERIAL PRIMARY KEY,
  appointment_id  INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id    INTEGER NOT NULL REFERENCES clinicians(id) ON DELETE RESTRICT,
  subjective      TEXT,
  objective       TEXT,
  assessment      TEXT,
  plan            TEXT,
  is_draft        BOOLEAN NOT NULL DEFAULT true,
  finalized_at    TIMESTAMPTZ,
  audio_url       TEXT,                 -- Temporary, deleted after note generation
  transcript      TEXT,                 -- From Whisper, stored for reference
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_client ON notes(client_id);

-- ============================================================
-- INVOICES
-- Monthly billing documents sent to parents
-- ============================================================
CREATE TABLE invoices (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  clinician_id    INTEGER NOT NULL REFERENCES clinicians(id) ON DELETE RESTRICT,
  contact_id      INTEGER REFERENCES contacts(id) ON DELETE SET NULL, -- Bill to
  invoice_number  TEXT NOT NULL UNIQUE,
  issued_date     DATE NOT NULL,
  due_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Unpaid'
                    CHECK (status IN ('Unpaid', 'Paid')),
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_payment_intent_id TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_client ON invoices(client_id);

-- ============================================================
-- INVOICE LINE ITEMS
-- Individual sessions included in an invoice
-- ============================================================
CREATE TABLE invoice_line_items (
  id              SERIAL PRIMARY KEY,
  invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  appointment_id  INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  service_date    DATE NOT NULL,
  description     TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  is_no_show      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);

-- ============================================================
-- SEED DATA - Services from the spec
-- ============================================================
INSERT INTO services (cpt_code, description, duration_minutes, full_rate, late_cancel_rate, is_default) VALUES
  ('92507', 'Treatment of speech, language, voice, communication, and/or auditory processing disorder; individual', 50, 175.00, null, true),
  ('92508', 'Group treatment for speech, language, or communication disorders', 50, 100.00, null, false),
  ('92520', 'Laryngeal function studies', 50, 100.00, null, false),
  ('92521', 'Evaluation of speech fluency', 50, 100.00, null, false),
  ('92522', 'Evaluation of speech production', 50, 100.00, null, false),
  ('92523', 'Evaluation of speech sound production with evaluation of language comprehension and expression', 50, 1250.00, null, false),
  ('92524', 'Behavioral and qualitative analysis of voice and resonance', 50, 100.00, null, false),
  ('92526', 'Treatment of swallowing dysfunction and/or oral function for feeding', 50, 100.00, null, false),
  ('92610', 'Evaluation of oral and pharyngeal swallowing function', 50, 100.00, null, false),
  ('96105', 'Assessment of Aphasia', 50, 100.00, null, false),
  ('96125', 'Standardized cognitive performance testing', 50, 100.00, null, false),
  ('97129', 'Therapeutic interventions that focus on cognitive function; initial 15 minutes', 50, 100.00, null, false),
  ('97130', 'Therapeutic interventions that focus on cognitive function; each additional 15 minutes', 50, 100.00, null, false),
  ('ADV',   'Advocacy/Consultation', 50, 200.00, null, false),
  ('BI',    'Bilingual speech and language evaluation', 50, 1250.00, null, false);
