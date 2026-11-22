import { databaseError, query } from "./db";
import type { Product, StockMovement } from "./types";

export type ProductInput = {
  sku: string;
  name: string;
  category: string;
  barcode?: string;
  priceCents: number;
  taxRateBp: number;
  lowStockThreshold: number;
  active: boolean;
};

export async function listProducts(search = "", includeInactive = false): Promise<Product[]> {
  const term = `%${search.trim().toLowerCase()}%`;
  const result = await query<Product>(
    `SELECT * FROM product_stock
     WHERE ($2::boolean OR active)
       AND ($1 = '%%' OR lower(name) LIKE $1 OR lower(sku) LIKE $1 OR lower(category) LIKE $1 OR lower(COALESCE(barcode, '')) LIKE $1)
     ORDER BY active DESC, name LIMIT 100`,
    [term, includeInactive],
  );
  return result.rows;
}

export async function getProduct(id: string): Promise<Product | null> {
  return (await query<Product>("SELECT * FROM product_stock WHERE id = $1", [id])).rows[0] ?? null;
}

function validateProduct(input: ProductInput) {
  if (!input.sku.trim() || !input.name.trim() || !input.category.trim()) throw new Error("SKU, product name and category are required");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new Error("Price must be non-negative cents");
  if (!Number.isInteger(input.taxRateBp) || input.taxRateBp < 0 || input.taxRateBp > 10000) throw new Error("Tax rate must be between 0 and 100%");
  if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0) throw new Error("Low-stock threshold must be a whole number");
}

export async function saveProduct(input: ProductInput, id?: string): Promise<string> {
  validateProduct(input);
  const values = [input.sku.trim(), input.name.trim(), input.category.trim(), input.barcode?.trim() || null,
    input.priceCents, input.taxRateBp, input.lowStockThreshold, input.active];
  try {
    if (id) {
      await query(`UPDATE products SET sku=$1,name=$2,category=$3,barcode=$4,price_cents=$5,tax_rate_bp=$6,
        low_stock_threshold=$7,active=$8,updated_at=now() WHERE id=$9`, [...values, id]);
      return id;
    }
    return (await query<{ id: string }>(`INSERT INTO products (sku,name,category,barcode,price_cents,tax_rate_bp,low_stock_threshold,active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, values)).rows[0].id;
  } catch (error) {
    throw databaseError(error);
  }
}

export async function addStock(productId: string, kind: "received" | "adjusted", quantity: number, reason: string, requestKey: string) {
  if (!Number.isInteger(quantity) || quantity === 0) throw new Error("Enter a non-zero whole-number quantity");
  if (kind === "received" && quantity < 0) throw new Error("Received quantity must be positive");
  if (!reason.trim()) throw new Error("Explain why this stock movement happened");
  await query("SELECT add_stock_movement($1,$2,$3,$4,$5::uuid)", [productId, kind, quantity, reason.trim(), requestKey]);
}

export async function listMovements(limit = 80): Promise<StockMovement[]> {
  return (await query<StockMovement>(`SELECT sm.id,sm.product_id,sm.kind,sm.quantity,sm.reason,sm.created_at,
    p.sku,p.name AS product_name FROM stock_movements sm JOIN products p ON p.id=sm.product_id
    ORDER BY sm.id DESC LIMIT $1`, [Math.min(200, Math.max(1, limit))])).rows;
}

export async function lowStock(): Promise<Product[]> {
  return (await query<Product>("SELECT * FROM product_stock WHERE active AND stock <= low_stock_threshold ORDER BY stock, name")).rows;
}
