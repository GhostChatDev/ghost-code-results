CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(body, '')), 'B')
  ) STORED
);
CREATE INDEX IF NOT EXISTS notes_search_idx ON notes USING gin (search_vector);
CREATE TABLE IF NOT EXISTS note_versions (
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  tags text[] NOT NULL,
  pinned boolean NOT NULL,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, revision),
  UNIQUE (note_id, request_id)
);
