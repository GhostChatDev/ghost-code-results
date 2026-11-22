"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { calculateSale, formatMoney, parseCents } from "@/lib/money";
import type { Product } from "@/lib/types";

type CartItem = Product & { quantity: number };
type Payment = "cash" | "card";

export function SaleWorkspace({ products }: { products: Product[] }) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const requestKey = useRef(crypto.randomUUID());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [discount, setDiscount] = useState("0");
  const [payment, setPayment] = useState<Payment>("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("tallyroom-draft") || "null") as { cart?: CartItem[]; discount?: string; key?: string } | null;
      if (saved?.cart) setCart(saved.cart);
      if (saved?.discount) setDiscount(saved.discount);
      if (saved?.key) requestKey.current = saved.key;
    } catch { /* A malformed local draft must never prevent the register opening. */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!cart.length) { localStorage.removeItem("tallyroom-draft"); return; }
    localStorage.setItem("tallyroom-draft", JSON.stringify({ cart, discount, key: requestKey.current }));
  }, [cart, discount, hydrated]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products.slice(0, 12);
    return products.filter((p) => [p.name, p.sku, p.barcode || ""].some((value) => value.toLowerCase().includes(term))).slice(0, 20);
  }, [products, search]);

  const discountCents = useMemo(() => {
    try { return parseCents(discount || "0", "Discount"); } catch { return 0; }
  }, [discount]);

  const totals = useMemo(() => {
    try {
      return calculateSale(cart.map((item) => ({
        productId: item.id, quantity: item.quantity,
        unitPriceCents: item.price_cents, taxRateBp: item.tax_rate_bp,
      })), discountCents);
    } catch { return null; }
  }, [cart, discountCents]);

  function add(product: Product) {
    setError(""); setNotice("");
    if (product.stock < 1) { setError(`${product.name} is out of stock.`); return; }
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) return current.map((item) => item.id === product.id ? { ...item, quantity: Math.min(item.stock, item.quantity + 1) } : item);
      return [...current, { ...product, quantity: 1 }];
    });
    setSearch("");
    searchRef.current?.focus();
  }

  function enterSearch(event: React.FormEvent) {
    event.preventDefault();
    const term = search.trim().toLowerCase();
    if (!term) return;
    const exact = products.find((p) => p.barcode?.toLowerCase() === term || p.sku.toLowerCase() === term);
    if (exact) add(exact);
    else if (matches.length === 1) add(matches[0]);
    else setError(matches.length ? "Choose a product from the matching results." : "No product matches that search or barcode.");
  }

  function changeQuantity(id: string, quantity: number) {
    setError("");
    setCart((current) => current.flatMap((item) => item.id !== id ? [item] :
      quantity < 1 ? [] : [{ ...item, quantity: Math.min(quantity, item.stock) }]));
  }

  function clearSale() {
    setCart([]); setDiscount("0"); setError(""); setNotice(""); setReceipt("");
    requestKey.current = crypto.randomUUID();
  }

  async function complete() {
    setError(""); setNotice("");
    if (!cart.length) { setError("Add a product before completing the sale."); return; }
    if (!totals) { setError("Check the discount: it cannot exceed the subtotal and may have at most two decimal places."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/sales", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestKey: requestKey.current, paymentMethod: payment, discountCents,
          lines: cart.map((item) => ({ productId: item.id, quantity: item.quantity,
            unitPriceCents: item.price_cents, taxRateBp: item.tax_rate_bp })),
        }),
      });
      const result = await response.json() as { saleId?: string; error?: string };
      if (!response.ok || !result.saleId) throw new Error(result.error || "The sale could not be completed.");
      setReceipt(result.saleId); setNotice(`Sale completed · ${formatMoney(totals.totalCents)} received by ${payment}.`);
      setCart([]); setDiscount("0"); requestKey.current = crypto.randomUUID();
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The sale could not be completed."); }
    finally { setBusy(false); }
  }

  return <div className="register-layout">
    <section className="panel catalog-panel" aria-labelledby="catalog-title">
      <div className="section-heading"><div><p className="eyebrow">NEW TRANSACTION</p><h1 id="catalog-title">Choose products</h1></div><span className="count-badge">{products.length} active</span></div>
      <form onSubmit={enterSearch} className="search-form">
        <label htmlFor="product-search">Search name or SKU, or scan a barcode</label>
        <div className="input-action"><input ref={searchRef} id="product-search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="e.g. Oat milk or 85001234" autoComplete="off" autoFocus /><button type="submit" disabled={!search.trim() || matches.length !== 1}>Add match</button></div>
      </form>
      <div className="product-grid" aria-live="polite">
        {matches.map((product) => <button type="button" className="product-card" key={product.id} onClick={() => add(product)} disabled={product.stock < 1}>
          <span className="product-category">{product.category}</span><strong>{product.name}</strong><span className="sku">{product.sku}</span>
          <span className="product-card-bottom"><b>{formatMoney(product.price_cents)}</b><span className={product.stock <= product.low_stock_threshold ? "low-stock" : "stock-ok"}>{product.stock} in stock</span></span>
        </button>)}
        {!matches.length && <div className="empty-state"><strong>No matching products</strong><p>Try another name, SKU or barcode. Add new items from Products.</p></div>}
      </div>
      <p className="keyboard-hint">Tip: type a full barcode and press Enter for an exact match. Prices shown exclude tax.</p>
    </section>

    <aside className="panel ticket" aria-labelledby="ticket-title">
      <div className="section-heading"><div><p className="eyebrow">CURRENT TICKET</p><h2 id="ticket-title">Sale summary</h2></div><span className="count-badge">{cart.reduce((sum, item) => sum + item.quantity, 0)} items</span></div>
      <div className="cart-lines">
        {cart.map((item) => <div className="cart-line" key={item.id}>
          <div className="cart-line-title"><div><strong>{item.name}</strong><span>{formatMoney(item.price_cents)} · tax {(item.tax_rate_bp / 100).toFixed(2)}%</span></div><button className="icon-button" aria-label={`Remove ${item.name}`} onClick={() => changeQuantity(item.id, 0)}>×</button></div>
          <div className="cart-line-bottom"><div className="quantity-control"><button aria-label={`Decrease ${item.name} quantity`} onClick={() => changeQuantity(item.id, item.quantity - 1)}>−</button>
            <input aria-label={`${item.name} quantity`} type="number" min="1" max={item.stock} value={item.quantity} onChange={(event) => changeQuantity(item.id, Number(event.target.value))} />
            <button aria-label={`Increase ${item.name} quantity`} onClick={() => changeQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= item.stock}>+</button></div>
            <strong>{formatMoney(item.price_cents * item.quantity)}</strong></div>
        </div>)}
        {!cart.length && <div className="empty-cart"><span aria-hidden="true">＋</span><strong>Your ticket is empty</strong><p>Select a product or scan a barcode to begin.</p></div>}
      </div>
      <div className="sale-controls">
        <label htmlFor="sale-discount">Discount (USD)<input id="sale-discount" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} onBlur={() => { try { setDiscount((parseCents(discount || "0") / 100).toFixed(2)); } catch { setError("Enter a discount such as 1.50."); } }} /></label>
        <fieldset><legend>Payment method</legend><div className="segmented">{(["card", "cash"] as const).map((method) => <button type="button" key={method} aria-pressed={payment === method} className={payment === method ? "selected" : ""} onClick={() => setPayment(method)}>{method === "card" ? "Card" : "Cash"}</button>)}</div></fieldset>
      </div>
      <dl className="totals"><div><dt>Subtotal</dt><dd>{formatMoney(totals?.subtotalCents || 0)}</dd></div><div><dt>Discount</dt><dd>−{formatMoney(totals?.discountCents || 0)}</dd></div><div><dt>Tax</dt><dd>{formatMoney(totals?.taxCents || 0)}</dd></div><div className="grand-total"><dt>Total</dt><dd>{formatMoney(totals?.totalCents || 0)}</dd></div></dl>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}{receipt && <a href={`/receipts/${receipt}`} target="_blank">Open printable receipt</a>}</div>}
      <button className="primary complete-button" disabled={busy || !cart.length} onClick={complete}>{busy ? "Completing sale…" : `Complete sale · ${formatMoney(totals?.totalCents || 0)}`}</button>
      <button className="text-button" disabled={busy || (!cart.length && discount === "0")} onClick={clearSale}>Clear ticket</button>
      <p className="transaction-note">The server checks current prices and stock again. A failed sale writes nothing.</p>
    </aside>
  </div>;
}
