export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  barcode: string | null;
  price_cents: number;
  tax_rate_bp: number;
  low_stock_threshold: number;
  active: boolean;
  stock: number;
};

export type SaleLine = {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate_bp: number;
  gross_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  refunded_quantity: number;
};

export type Sale = {
  id: string;
  receipt_number: string;
  payment_method: "cash" | "card";
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  refunded_subtotal_cents: number;
  refunded_discount_cents: number;
  refunded_tax_cents: number;
  refunded_total_cents: number;
  status: "completed" | "partially_refunded" | "refunded";
  created_at: string;
  lines: SaleLine[];
};

export type StockMovement = {
  id: number;
  product_id: string;
  kind: "received" | "sold" | "returned" | "adjusted";
  quantity: number;
  reason: string;
  created_at: string;
  sku?: string;
  product_name?: string;
  request_key?: string;
};

export type Report = {
  day: string;
  salesCount: number;
  unitsSold: number;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  grossCents: number;
  refundCents: number;
  netCents: number;
  topProducts: { sku: string; name: string; quantity: number; netCents: number }[];
  hourly: { hour: number; totalCents: number }[];
};
