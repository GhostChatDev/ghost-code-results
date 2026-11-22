"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product, StockMovement } from "@/lib/types";

export function StockManager({ products, movements, low }: { products: Product[]; movements: StockMovement[]; low: Product[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [kind, setKind] = useState<"received" | "adjusted">("received");
  const [quantity, setQuantity] = useState("10");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const shown = useMemo(() => movements.filter((m) => `${m.product_name ?? ""} ${m.sku ?? ""} ${m.kind} ${m.reason}`.toLowerCase().includes(filter.toLowerCase())), [movements, filter]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/stock", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, kind, quantity: Number(quantity), reason, requestKey }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) { setError(result?.error ?? "The movement could not be saved."); return; }
    setReason(""); setRequestKey(crypto.randomUUID()); router.refresh();
  }

  return <>
    {low.length > 0 && <section className="panel low-stock-panel" aria-labelledby="low-stock-title">
      <div className="panel-heading"><h2 id="low-stock-title">Low stock <span className="count-badge">{low.length}</span></h2><span className="muted">At or below each product’s alert level</span></div>
      <div className="low-stock-grid">{low.map((product) => <button key={product.id} onClick={() => { setProductId(product.id); setKind("received"); document.getElementById("movement-reason")?.focus(); }}>
        <span><strong>{product.name}</strong><small>{product.sku} · alert at {product.low_stock_threshold}</small></span><b>{product.stock} left</b>
      </button>)}</div>
    </section>}
    <section className="panel">
      <div className="panel-heading"><h2>Record a movement</h2><span className="muted">Received stock must be positive. Adjustments may remove stock, with a reason.</span></div>
      <form className="stock-form" onSubmit={submit}>
        <label>Product<select required value={productId} onChange={(e) => setProductId(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku} ({p.stock} on hand)</option>)}</select></label>
        <label>Movement<select value={kind} onChange={(e) => setKind(e.target.value as "received" | "adjusted")}><option value="received">Received</option><option value="adjusted">Adjusted</option></select></label>
        <label>Quantity<input required type="number" step="1" min={kind === "received" ? 1 : undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
        <label className="reason-field">Reason<input id="movement-reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "received" ? "Supplier delivery" : "Damaged in storage"} /></label>
        <button className="primary" disabled={busy || !productId}>{busy ? "Saving…" : "Add movement"}</button>
      </form>
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
    <section className="panel table-panel">
      <div className="panel-heading"><h2>Movement history</h2><label className="compact-search"><span className="sr-only">Filter movements</span><input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter ledger" /></label></div>
      <div className="table-scroll"><table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Change</th><th>Reason</th></tr></thead><tbody>
        {shown.map((m) => <tr key={m.id}><td>{new Date(m.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td><td><strong>{m.product_name}</strong><small>{m.sku}</small></td><td><span className={`status movement-${m.kind}`}>{m.kind}</span></td><td className={`money ${m.quantity > 0 ? "positive" : "negative"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td><td>{m.reason}</td></tr>)}
      </tbody></table>{!shown.length && <div className="empty-state"><h3>No movements found</h3><p>Try another filter or record the first movement above.</p></div>}</div>
    </section>
  </>;
}
