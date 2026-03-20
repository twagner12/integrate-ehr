-- Track AI draft vs clinician's final version for continuous improvement
ALTER TABLE notes ADD COLUMN IF NOT EXISTS ai_draft_subjective TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS ai_draft_objective TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS ai_draft_assessment TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS ai_draft_plan TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS ai_prompt_version TEXT;

-- Per-clinician style preferences
ALTER TABLE clinicians ADD COLUMN IF NOT EXISTS note_style_instructions TEXT;

-- Example notes table for few-shot prompting
CREATE TABLE IF NOT EXISTS note_examples (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL,
  transcript  TEXT,
  subjective  TEXT NOT NULL,
  objective   TEXT NOT NULL,
  assessment  TEXT NOT NULL,
  plan        TEXT NOT NULL,
  service_type TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
