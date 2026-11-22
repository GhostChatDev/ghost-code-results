CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, id)
);
CREATE TABLE IF NOT EXISTS rates (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  numerator bigint NOT NULL CHECK (numerator > 0),
  denominator bigint NOT NULL CHECK (denominator > 0),
  PRIMARY KEY (group_id, currency)
);
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  paid_by uuid NOT NULL,
  currency char(3) NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  main_amount bigint NOT NULL CHECK (main_amount > 0),
  rate_numerator bigint NOT NULL CHECK (rate_numerator > 0),
  rate_denominator bigint NOT NULL CHECK (rate_denominator > 0),
  split_type text NOT NULL CHECK (split_type IN ('equal', 'exact', 'percentage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, paid_by) REFERENCES members(group_id, id),
  UNIQUE (group_id, id)
);
CREATE TABLE IF NOT EXISTS expense_shares (
  group_id uuid NOT NULL,
  expense_id uuid NOT NULL,
  member_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  main_amount bigint NOT NULL CHECK (main_amount >= 0),
  PRIMARY KEY (expense_id, member_id),
  FOREIGN KEY (group_id, expense_id) REFERENCES expenses(group_id, id) ON DELETE CASCADE,
  FOREIGN KEY (group_id, member_id) REFERENCES members(group_id, id)
);
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL,
  payee_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (payer_id <> payee_id),
  FOREIGN KEY (group_id, payer_id) REFERENCES members(group_id, id),
  FOREIGN KEY (group_id, payee_id) REFERENCES members(group_id, id)
);
