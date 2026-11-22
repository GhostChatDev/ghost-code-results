CREATE TABLE IF NOT EXISTS boards (
  id text PRIMARY KEY,
  state jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS board_operations (
  board_id text NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, operation_id)
);
