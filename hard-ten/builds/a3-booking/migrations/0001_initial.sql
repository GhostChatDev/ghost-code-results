CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE providers (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL,
  timezone text NOT NULL
);

CREATE TABLE weekly_hours (
  provider_id integer NOT NULL REFERENCES providers(id),
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  PRIMARY KEY (provider_id, weekday),
  CHECK (start_time < end_time)
);

CREATE TABLE days_off (
  provider_id integer NOT NULL REFERENCES providers(id),
  day date NOT NULL,
  PRIMARY KEY (provider_id, day)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id integer NOT NULL REFERENCES providers(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 120),
  buffer_minutes integer NOT NULL CHECK (buffer_minutes BETWEEN 0 AND 120),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id integer NOT NULL REFERENCES providers(id),
  service_id uuid NOT NULL REFERENCES services(id),
  service_name text NOT NULL,
  client_name text NOT NULL CHECK (length(trim(client_name)) BETWEEN 1 AND 100),
  client_email text NOT NULL CHECK (length(client_email) BETWEEN 3 AND 254),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  blocked_until timestamptz NOT NULL,
  cancel_token_hash text NOT NULL UNIQUE,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at < end_at AND end_at <= blocked_until),
  CONSTRAINT no_overlapping_bookings EXCLUDE USING gist
    (provider_id WITH =, tstzrange(start_at, blocked_until, '[)') WITH &&)
    WHERE (cancelled_at IS NULL)
);

CREATE TABLE IF NOT EXISTS booking_idempotency (
  idempotency_key text PRIMARY KEY CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 128),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  cancel_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO providers (id, name, timezone) VALUES (1, 'Hourglass Desk', 'America/New_York');
INSERT INTO weekly_hours (provider_id, weekday, start_time, end_time)
SELECT 1, d, '09:00', '17:00' FROM generate_series(1, 5) AS d;
INSERT INTO services (provider_id, name, duration_minutes, buffer_minutes) VALUES
  (1, 'Discovery call', 30, 15),
  (1, 'Consultation', 60, 15);
