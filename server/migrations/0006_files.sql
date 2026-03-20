CREATE TABLE IF NOT EXISTS files (
  id           SERIAL PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Other',
  uploaded_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_client ON files(client_id);
