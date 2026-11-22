BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE CHECK (btrim(sku) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  category text NOT NULL DEFAULT 'General',
  barcode text UNIQUE CHECK (barcode IS NULL OR btrim(barcode) <> ''),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  tax_rate_bp integer NOT NULL CHECK (tax_rate_bp BETWEEN 0 AND 10000),
  low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  request_key uuid NOT NULL UNIQUE,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card')),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents integer NOT NULL CHECK (discount_cents BETWEEN 0 AND subtotal_cents),
  tax_cents integer NOT NULL CHECK (tax_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents = subtotal_cents - discount_cents + tax_cents),
  refunded_subtotal_cents integer NOT NULL DEFAULT 0 CHECK (refunded_subtotal_cents >= 0),
  refunded_discount_cents integer NOT NULL DEFAULT 0 CHECK (refunded_discount_cents >= 0),
  refunded_tax_cents integer NOT NULL DEFAULT 0 CHECK (refunded_tax_cents >= 0),
  refunded_total_cents integer NOT NULL DEFAULT 0 CHECK (refunded_total_cents >= 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partially_refunded', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  tax_rate_bp integer NOT NULL CHECK (tax_rate_bp BETWEEN 0 AND 10000),
  gross_cents integer NOT NULL CHECK (gross_cents = quantity * unit_price_cents),
  discount_cents integer NOT NULL CHECK (discount_cents BETWEEN 0 AND gross_cents),
  tax_cents integer NOT NULL CHECK (tax_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents = gross_cents - discount_cents + tax_cents),
  refunded_quantity integer NOT NULL DEFAULT 0 CHECK (refunded_quantity BETWEEN 0 AND quantity)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  request_key uuid NOT NULL UNIQUE,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents > 0),
  discount_cents integer NOT NULL CHECK (discount_cents BETWEEN 0 AND subtotal_cents),
  tax_cents integer NOT NULL CHECK (tax_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents = subtotal_cents - discount_cents + tax_cents),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refund_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES refunds(id) ON DELETE RESTRICT,
  sale_line_id uuid NOT NULL REFERENCES sale_lines(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  gross_cents integer NOT NULL CHECK (gross_cents > 0),
  discount_cents integer NOT NULL CHECK (discount_cents BETWEEN 0 AND gross_cents),
  tax_cents integer NOT NULL CHECK (tax_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents = gross_cents - discount_cents + tax_cents)
);

CREATE TABLE stock_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('received', 'sold', 'returned', 'adjusted')),
  quantity integer NOT NULL CHECK (quantity <> 0),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  sale_line_id uuid UNIQUE REFERENCES sale_lines(id) ON DELETE RESTRICT,
  refund_line_id uuid UNIQUE REFERENCES refund_lines(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'sold' AND quantity < 0 AND sale_line_id IS NOT NULL AND refund_line_id IS NULL)
    OR (kind = 'returned' AND quantity > 0 AND refund_line_id IS NOT NULL AND sale_line_id IS NULL)
    OR (kind IN ('received', 'adjusted') AND sale_line_id IS NULL AND refund_line_id IS NULL))
);

CREATE OR REPLACE FUNCTION reject_ledger_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Stock movements are append-only';
END;
$$;

CREATE TRIGGER stock_movements_append_only
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION reject_ledger_changes();

CREATE VIEW product_stock WITH (security_invoker = true) AS
SELECT p.id, p.sku, p.name, p.category, p.barcode, p.price_cents, p.tax_rate_bp,
  p.low_stock_threshold, p.active, p.created_at, p.updated_at,
  COALESCE(SUM(sm.quantity), 0)::integer AS stock
FROM products p
LEFT JOIN stock_movements sm ON sm.product_id = p.id
GROUP BY p.id;

CREATE INDEX stock_movements_product_idx ON stock_movements(product_id, id DESC);
CREATE INDEX stock_movements_created_idx ON stock_movements(created_at DESC);
CREATE INDEX sale_lines_sale_idx ON sale_lines(sale_id);
CREATE INDEX sales_created_idx ON sales(created_at DESC);
CREATE INDEX refunds_sale_idx ON refunds(sale_id);
CREATE INDEX products_search_idx ON products(lower(name));

COMMIT;
-- Inventory is derived exclusively from stock_movements. No mutable stock column exists.
ALTER TABLE stock_movements ADD COLUMN request_key uuid UNIQUE;
CREATE OR REPLACE FUNCTION current_stock(p_product_id uuid) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT SUM(quantity) FROM stock_movements WHERE product_id = p_product_id), 0)::integer
$$;

-- All sale rows, line snapshots and outgoing movements commit or roll back together.
-- The row lock makes concurrent sales of the same product deterministic.
CREATE OR REPLACE FUNCTION complete_sale(p_payment_method text, p_lines jsonb, p_discount_cents integer DEFAULT 0, p_request_key uuid DEFAULT gen_random_uuid())
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_sale_id uuid;
  v_line jsonb;
  v_product products%ROWTYPE;
  v_quantity integer;
  v_discount integer;
  v_remaining integer := p_discount_cents;
  v_gross integer;
  v_line_gross integer;
  v_tax integer;
  v_total integer := 0;
  v_total_discount integer := 0;
  v_total_tax integer := 0;
  v_stock integer;
  v_count integer;
BEGIN
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Request key is required'; END IF;
  SELECT id INTO v_sale_id FROM sales WHERE request_key = p_request_key;
  IF FOUND THEN RETURN v_sale_id; END IF;
  IF p_payment_method NOT IN ('cash', 'card') THEN RAISE EXCEPTION 'Choose cash or card'; END IF;
  IF p_discount_cents IS NULL OR p_discount_cents < 0 THEN RAISE EXCEPTION 'Discount cannot be negative'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Add at least one product'; END IF;
  SELECT COUNT(*) INTO v_count FROM jsonb_array_elements(p_lines) AS input(value);
  IF v_count <> (SELECT COUNT(DISTINCT value->>'productId') FROM jsonb_array_elements(p_lines) AS input(value)) THEN
    RAISE EXCEPTION 'Each product can appear only once';
  END IF;
  SELECT COALESCE(SUM((value->>'quantity')::integer * (value->>'unitPriceCents')::integer), 0)
    INTO v_gross FROM jsonb_array_elements(p_lines);
  IF p_discount_cents > v_gross THEN RAISE EXCEPTION 'Discount cannot exceed the subtotal'; END IF;

  INSERT INTO sales (receipt_number, request_key, payment_method, subtotal_cents, discount_cents, tax_cents, total_cents)
  VALUES ('TR-' || to_char(clock_timestamp(), 'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 5),
    p_request_key, p_payment_method, v_gross, 0, 0, v_gross) RETURNING id INTO v_sale_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_quantity := (v_line->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 9999 THEN RAISE EXCEPTION 'Quantity must be between 1 and 9999'; END IF;
    SELECT * INTO v_product FROM products WHERE id = (v_line->>'productId')::uuid FOR UPDATE;
    IF NOT FOUND OR NOT v_product.active THEN RAISE EXCEPTION 'Product is not available'; END IF;
    IF v_product.price_cents <> (v_line->>'unitPriceCents')::integer THEN RAISE EXCEPTION 'A product price changed; refresh the register'; END IF;
    v_stock := current_stock(v_product.id);
    IF v_stock < v_quantity THEN RAISE EXCEPTION 'Not enough stock for % (% available)', v_product.name, v_stock; END IF;
    v_line_gross := v_quantity * v_product.price_cents;
    -- Floor each proportional share, then put the remaining cents on the final line.
    -- lib/money.ts implements this exact rule for the register preview.
    IF v_line = (SELECT value FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS input(value, position) ORDER BY position DESC LIMIT 1) THEN
      v_discount := v_remaining;
    ELSE
      v_discount := LEAST(v_line_gross, FLOOR(p_discount_cents * v_line_gross::numeric / NULLIF(v_gross, 0))::integer);
    END IF;
    v_remaining := v_remaining - v_discount;
    v_tax := FLOOR((v_line_gross - v_discount) * v_product.tax_rate_bp::numeric / 10000 + 0.5)::integer;
    IF v_line_gross - v_discount + v_tax < 0 THEN RAISE EXCEPTION 'Line total cannot be negative'; END IF;
    INSERT INTO sale_lines (sale_id, product_id, sku, product_name, quantity, unit_price_cents, tax_rate_bp,
      gross_cents, discount_cents, tax_cents, total_cents)
    VALUES (v_sale_id, v_product.id, v_product.sku, v_product.name, v_quantity, v_product.price_cents,
      v_product.tax_rate_bp, v_line_gross, v_discount, v_tax, v_line_gross - v_discount + v_tax);
    INSERT INTO stock_movements (product_id, kind, quantity, reason, sale_line_id)
    SELECT v_product.id, 'sold', -v_quantity, 'Sale ' || (SELECT receipt_number FROM sales WHERE id = v_sale_id), id
      FROM sale_lines WHERE sale_id = v_sale_id AND product_id = v_product.id;
    v_total_discount := v_total_discount + v_discount;
    v_total_tax := v_total_tax + v_tax;
    v_total := v_total + v_line_gross - v_discount + v_tax;
  END LOOP;
  UPDATE sales SET discount_cents = v_total_discount, tax_cents = v_total_tax,
    total_cents = v_gross - v_total_discount + v_total_tax WHERE id = v_sale_id;
  RETURN v_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION refund_sale(p_sale_id uuid, p_reason text, p_lines jsonb, p_request_key uuid DEFAULT gen_random_uuid())
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_refund_id uuid;
  v_line jsonb;
  v_sale_line sale_lines%ROWTYPE;
  v_quantity integer;
  v_gross integer;
  v_discount integer;
  v_tax integer;
  v_subtotal integer := 0;
  v_total_discount integer := 0;
  v_tax_total integer := 0;
  v_total integer := 0;
  v_count integer;
BEGIN
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Request key is required'; END IF;
  SELECT id INTO v_refund_id FROM refunds WHERE request_key = p_request_key;
  IF FOUND THEN RETURN v_refund_id; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A refund reason is required'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Choose at least one line to refund'; END IF;
  SELECT COUNT(*) INTO v_count FROM jsonb_array_elements(p_lines);
  IF v_count <> (SELECT COUNT(DISTINCT value->>'saleLineId') FROM jsonb_array_elements(p_lines)) THEN RAISE EXCEPTION 'Each line can appear only once'; END IF;
  PERFORM 1 FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  INSERT INTO refunds (sale_id, request_key, reason, subtotal_cents, discount_cents, tax_cents, total_cents)
  VALUES (p_sale_id, p_request_key, btrim(p_reason), 1, 0, 0, 1) RETURNING id INTO v_refund_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_sale_line FROM sale_lines WHERE id = (v_line->>'saleLineId')::uuid AND sale_id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Refund line does not belong to this sale'; END IF;
    v_quantity := (v_line->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > v_sale_line.quantity - v_sale_line.refunded_quantity THEN RAISE EXCEPTION 'Refund quantity exceeds what remains'; END IF;
    v_gross := v_quantity * v_sale_line.unit_price_cents;
    v_discount := FLOOR(v_quantity * v_sale_line.discount_cents::numeric / v_sale_line.quantity + 0.5)::integer;
    v_tax := FLOOR((v_gross - v_discount) * v_sale_line.tax_rate_bp::numeric / 10000 + 0.5)::integer;
    IF v_quantity = v_sale_line.quantity - v_sale_line.refunded_quantity THEN
      v_discount := v_sale_line.discount_cents - COALESCE((SELECT SUM(rl.discount_cents) FROM refund_lines rl WHERE rl.sale_line_id = v_sale_line.id), 0);
      v_tax := v_sale_line.tax_cents - COALESCE((SELECT SUM(rl.tax_cents) FROM refund_lines rl WHERE rl.sale_line_id = v_sale_line.id), 0);
    END IF;
    INSERT INTO refund_lines (refund_id, sale_line_id, quantity, gross_cents, discount_cents, tax_cents, total_cents)
    VALUES (v_refund_id, v_sale_line.id, v_quantity, v_gross, v_discount, v_tax, v_gross - v_discount + v_tax);
    INSERT INTO stock_movements (product_id, kind, quantity, reason, refund_line_id)
    SELECT v_sale_line.product_id, 'returned', v_quantity, 'Refund: ' || btrim(p_reason), id
      FROM refund_lines WHERE refund_id = v_refund_id AND sale_line_id = v_sale_line.id;
    UPDATE sale_lines SET refunded_quantity = refunded_quantity + v_quantity WHERE id = v_sale_line.id;
    v_subtotal := v_subtotal + v_gross;
    v_total_discount := v_total_discount + v_discount;
    v_tax_total := v_tax_total + v_tax;
    v_total := v_total + v_gross - v_discount + v_tax;
  END LOOP;
  UPDATE refunds SET subtotal_cents = v_subtotal, discount_cents = v_total_discount,
    tax_cents = v_tax_total, total_cents = v_total WHERE id = v_refund_id;
  UPDATE sales s SET refunded_subtotal_cents = refunded_subtotal_cents + v_subtotal,
    refunded_discount_cents = refunded_discount_cents + v_total_discount,
    refunded_tax_cents = refunded_tax_cents + v_tax_total,
    refunded_total_cents = refunded_total_cents + v_total,
    status = CASE WHEN NOT EXISTS (SELECT 1 FROM sale_lines sl WHERE sl.sale_id = s.id AND sl.refunded_quantity < sl.quantity)
      THEN 'refunded' ELSE 'partially_refunded' END WHERE s.id = p_sale_id;
  RETURN v_refund_id;
END;
$$;

CREATE OR REPLACE FUNCTION add_stock_movement(p_product_id uuid, p_kind text, p_quantity integer, p_reason text, p_request_key uuid DEFAULT gen_random_uuid())
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_movement_id bigint; v_product_name text; v_stock integer;
BEGIN
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Request key is required'; END IF;
  SELECT id INTO v_movement_id FROM stock_movements WHERE request_key = p_request_key;
  IF FOUND THEN RETURN v_movement_id; END IF;
  IF p_kind NOT IN ('received', 'adjusted') THEN RAISE EXCEPTION 'Only received or adjusted movements can be entered manually'; END IF;
  IF p_quantity IS NULL OR p_quantity = 0 THEN RAISE EXCEPTION 'Movement quantity cannot be zero'; END IF;
  IF p_kind = 'received' AND p_quantity < 0 THEN RAISE EXCEPTION 'Received quantity must be positive'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A movement reason is required'; END IF;
  SELECT name INTO v_product_name FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  v_stock := current_stock(p_product_id);
  IF v_stock + p_quantity < 0 THEN RAISE EXCEPTION 'Adjustment would make % stock negative', v_product_name; END IF;
  INSERT INTO stock_movements (product_id, kind, quantity, reason, request_key)
  VALUES (p_product_id, p_kind, p_quantity, btrim(p_reason), p_request_key) RETURNING id INTO v_movement_id;
  RETURN v_movement_id;
END;
$$;

-- Demo fixtures make a new installation immediately explorable. They use ordinary
-- ledger and sale functions; production can remove the seeded rows through its own migration.
INSERT INTO products (id, sku, name, category, barcode, price_cents, tax_rate_bp, low_stock_threshold)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'PAN-001', 'Country sourdough', 'Bakery', '850001001', 650, 0, 8),
  ('10000000-0000-0000-0000-000000000002', 'DAI-002', 'Whole milk · 1L', 'Dairy', '850001002', 320, 0, 12),
  ('10000000-0000-0000-0000-000000000003', 'PAN-003', 'Sea salt croissant', 'Bakery', '850001003', 385, 0, 10),
  ('10000000-0000-0000-0000-000000000004', 'GRN-004', 'House coffee beans · 250g', 'Coffee', '850001004', 1450, 850, 6),
  ('10000000-0000-0000-0000-000000000005', 'GRN-005', 'Wildflower honey · 340g', 'Pantry', '850001005', 990, 0, 5),
  ('10000000-0000-0000-0000-000000000006', 'GRN-006', 'Stoneground oats · 750g', 'Pantry', '850001006', 550, 0, 8),
  ('10000000-0000-0000-0000-000000000007', 'DAI-007', 'Farmhouse cheddar · 200g', 'Dairy', '850001007', 775, 0, 6),
  ('10000000-0000-0000-0000-000000000008', 'GRN-008', 'Sparkling water · 330ml', 'Drinks', '850001008', 225, 850, 12),
  ('10000000-0000-0000-0000-000000000009', 'GRN-009', 'Olive oil · 500ml', 'Pantry', '850001009', 1650, 0, 4),
  ('10000000-0000-0000-0000-000000000010', 'PAN-010', 'Cinnamon morning bun', 'Bakery', '850001010', 425, 0, 8),
  ('10000000-0000-0000-0000-000000000011', 'GRN-011', 'Dark chocolate · 70%', 'Pantry', '850001011', 475, 850, 10),
  ('10000000-0000-0000-0000-000000000012', 'GRN-012', 'Grapefruit soda', 'Drinks', '850001012', 350, 850, 8);

SELECT add_stock_movement(id, 'received', v.qty, 'Demo opening delivery', md5('Tallyroom opening delivery: ' || p.sku)::uuid)
FROM products p JOIN (VALUES
  ('PAN-001', 22), ('DAI-002', 36), ('PAN-003', 28), ('GRN-004', 17),
  ('GRN-005', 3), ('GRN-006', 18), ('DAI-007', 15), ('GRN-008', 28),
  ('GRN-009', 2), ('PAN-010', 21), ('GRN-011', 20), ('GRN-012', 5)
) AS v(sku, qty) ON p.sku = v.sku;

DO $$
DECLARE
  v_sale uuid;
  v_now timestamptz := date_trunc('day', now()) + interval '2 hours';
BEGIN
  v_sale := complete_sale('card', '[{"productId":"10000000-0000-0000-0000-000000000001","quantity":1,"unitPriceCents":650},{"productId":"10000000-0000-0000-0000-000000000004","quantity":2,"unitPriceCents":1450}]', 100, '30000000-0000-0000-0000-000000000001');
  UPDATE sales SET created_at = v_now + interval '1 hour' WHERE id = v_sale;
  v_sale := complete_sale('cash', '[{"productId":"10000000-0000-0000-0000-000000000003","quantity":3,"unitPriceCents":385},{"productId":"10000000-0000-0000-0000-000000000008","quantity":2,"unitPriceCents":225}]', 0, '30000000-0000-0000-0000-000000000002');
  UPDATE sales SET created_at = v_now + interval '3 hours' WHERE id = v_sale;
  v_sale := complete_sale('card', '[{"productId":"10000000-0000-0000-0000-000000000007","quantity":2,"unitPriceCents":775},{"productId":"10000000-0000-0000-0000-000000000009","quantity":1,"unitPriceCents":1650}]', 200, '30000000-0000-0000-0000-000000000003');
  UPDATE sales SET created_at = v_now + interval '5 hours' WHERE id = v_sale;
  v_sale := complete_sale('card', '[{"productId":"10000000-0000-0000-0000-000000000010","quantity":2,"unitPriceCents":425},{"productId":"10000000-0000-0000-0000-000000000011","quantity":2,"unitPriceCents":475}]', 50, '30000000-0000-0000-0000-000000000004');
  UPDATE sales SET created_at = v_now + interval '7 hours' WHERE id = v_sale;
  v_sale := complete_sale('cash', '[{"productId":"10000000-0000-0000-0000-000000000002","quantity":4,"unitPriceCents":320},{"productId":"10000000-0000-0000-0000-000000000006","quantity":1,"unitPriceCents":550}]', 0, '30000000-0000-0000-0000-000000000005');
  UPDATE sales SET created_at = v_now + interval '9 hours' WHERE id = v_sale;
  SELECT refund_sale(v_sale, 'Demo: wrong milk size', jsonb_build_array(jsonb_build_object('saleLineId', (SELECT id FROM sale_lines WHERE sale_id = v_sale AND sku = 'DAI-002'), 'quantity', 1)), '40000000-0000-0000-0000-000000000001') INTO v_sale;
END;
$$;

INSERT INTO schema_migrations (name) VALUES ('0001_initial.sql');
