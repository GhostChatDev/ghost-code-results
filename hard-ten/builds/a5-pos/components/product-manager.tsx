"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";

type FormState = { sku: string; name: string; category: string; barcode: string; price: string; tax: string; threshold: string; active: boolean };
const empty: FormState = { sku: "", name: "", category: "Pantry", barcode: "", price: "", tax: "8.50", threshold: "5", active: true };

export function ProductManager({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [editId, setEditId] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const products = useMemo(() => initialProducts.filter((p) => `${p.name} ${p.sku} ${p.barcode ?? ""} ${p.category}`.toLowerCase().includes(query.toLowerCase())), [initialProducts, query]);

  function edit(product?: Product) {
    setEditId(product?.id);
    setForm(product ? { sku: product.sku, name: product.name, category: product.category, barcode: product.barcode ?? "", price: (product.price_cents / 100).toFixed(2), tax: (product.tax_rate_bp / 100).toFixed(2), threshold: String(product.low_stock_threshold), active: product.active } : empty);
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true); setError("");
    const priceParts = form.price.split(".");
    const taxParts = form.tax.split(".");
    const priceCents = /^\d+(\.\d{0,2})?$/.test(form.price) ? Number(priceParts[0]) * 100 + Number((priceParts[1] ?? "").padEnd(2, "0")) : NaN;
    const taxRateBp = /^\d+(\.\d{0,2})?$/.test(form.tax) ? Number(taxParts[0]) * 100 + Number((taxParts[1] ?? "").padEnd(2, "0")) : NaN;
    const response = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editId, sku: form.sku, name: form.name, category: form.category, barcode: form.barcode, priceCents, taxRateBp, lowStockThreshold: Number(form.threshold), active: form.active }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) { setError(result?.error ?? "The product could not be saved."); return; }
    setForm(null); router.refresh();
  }

  return <>
    <div className="toolbar"><label className="search-field"><span>Find a product</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, SKU or barcode" /></label><button className="primary" onClick={() => edit()}>+ New product</button></div>
    {form && <form className="panel product-form" onSubmit={save}>
      <div className="panel-heading"><h2>{editId ? "Edit product" : "New product"}</h2><button type="button" className="text-button" onClick={() => setForm(null)}>Close</button></div>
      <div className="form-grid">
        <label>Product name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>SKU<input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label>
        <label>Category<input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
        <label>Barcode<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></label>
        <label>Price ($)<input required inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" /></label>
        <label>Tax rate (%)<input required inputMode="decimal" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></label>
        <label>Low-stock alert at<input required type="number" min="0" step="1" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} /></label>
        <label className="check-label"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Available in register</label>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save product"}</button>
    </form>}
    <section className="panel table-panel"><div className="panel-heading"><h2>Catalog <span className="count-badge">{products.length}</span></h2><span className="muted">Stock comes from the movement ledger</span></div>
      <div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU / barcode</th><th>Price</th><th>Tax</th><th>Stock</th><th>Status</th><th><span className="sr-only">Edit</span></th></tr></thead><tbody>
        {products.map((p) => <tr key={p.id}><td><strong>{p.name}</strong><small>{p.category}</small></td><td><span className="mono">{p.sku}</span><small>{p.barcode ?? "No barcode"}</small></td><td className="money">{formatMoney(p.price_cents)}</td><td>{(p.tax_rate_bp / 100).toFixed(2)}%</td><td><strong className={p.stock <= p.low_stock_threshold ? "danger-text" : ""}>{p.stock}</strong><small>Alert at {p.low_stock_threshold}</small></td><td><span className={`status ${p.active ? "status-good" : ""}`}>{p.active ? "Active" : "Inactive"}</span></td><td><button className="small-button" onClick={() => edit(p)}>Edit</button></td></tr>)}
      </tbody></table>{products.length === 0 && <div className="empty-state"><h3>No matching products</h3><p>Try another name, SKU or barcode.</p></div>}</div>
    </section>
  </>;
}
