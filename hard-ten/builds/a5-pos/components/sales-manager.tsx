"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SaleRecord } from "@/lib/history";
import { formatMoney } from "@/lib/money";

export function SalesManager({ sales }: { sales: SaleRecord[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [refundId, setRefundId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const shown = useMemo(() => sales.filter((sale) =>
    `${sale.receipt_number} ${sale.lines.map((line) => `${line.product_name} ${line.sku}`).join(" ")}`.toLowerCase().includes(filter.toLowerCase()),
  ), [filter, sales]);
  const refundSale = sales.find((sale) => sale.id === refundId);

  function openRefund(sale: SaleRecord) {
    setRefundId(sale.id);
    setQuantities(Object.fromEntries(sale.lines.map((line) => [line.id, line.quantity - line.refunded_quantity])));
    setReason(""); setMessage(null); setRequestKey(crypto.randomUUID());
  }

  async function submitRefund(event: React.FormEvent) {
    event.preventDefault();
    if (!refundSale) return;
    const lines = Object.entries(quantities).filter(([, quantity]) => quantity > 0)
      .map(([saleLineId, quantity]) => ({ saleLineId, quantity }));
    if (!lines.length) { setMessage({ kind: "error", text: "Enter at least one quantity to refund." }); return; }
    setBusy(true); setMessage(null);
    const response = await fetch("/api/refunds", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleId: refundSale.id, lines, reason, requestKey }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) { setMessage({ kind: "error", text: result?.error ?? "The refund could not be saved." }); return; }
    setRefundId(null); setMessage({ kind: "success", text: "Refund saved. Returned items are back in stock." });
    setRequestKey(crypto.randomUUID()); router.refresh();
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">TRANSACTIONS</p><h1>Sales & refunds</h1><p>Review completed sales, print a receipt, or return individual lines.</p></div><Link className="button primary" href="/sale">New sale</Link></div>
    {message && <p className={message.kind === "error" ? "notice error" : "notice success"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
    {refundSale && <section className="panel refund-panel" aria-labelledby="refund-heading">
      <div className="panel-heading"><div><p className="eyebrow">RETURN STOCK</p><h2 id="refund-heading">Refund {refundSale.receipt_number}</h2></div><button type="button" onClick={() => setRefundId(null)} disabled={busy}>Cancel</button></div>
      <p className="muted">Quantities start at the full remaining amount. Reduce any line for a partial refund, or set it to zero to keep it.</p>
      <form onSubmit={submitRefund}>
        <div className="table-scroll"><table><thead><tr><th>Product</th><th>Sold</th><th>Already returned</th><th>Return now</th></tr></thead><tbody>
          {refundSale.lines.map((line) => { const remaining = line.quantity - line.refunded_quantity; return <tr key={line.id}>
            <td><strong>{line.product_name}</strong><small>{line.sku} · {formatMoney(line.unit_price_cents)} each</small></td><td>{line.quantity}</td><td>{line.refunded_quantity}</td>
            <td><label className="quantity-label"><span className="sr-only">Return quantity for {line.product_name}</span><input type="number" min="0" max={remaining} step="1" required disabled={!remaining || busy} value={quantities[line.id] ?? 0} onChange={(event) => setQuantities({ ...quantities, [line.id]: Number(event.target.value) })} /> <span>of {remaining}</span></label></td>
          </tr>; })}
        </tbody></table></div>
        <div className="refund-actions"><label>Reason for refund<input required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Damaged, incorrect item…" disabled={busy} /></label><button className="danger-button" disabled={busy || !reason.trim()}>{busy ? "Saving refund…" : "Confirm refund"}</button></div>
      </form>
    </section>}
    <section className="panel table-panel"><div className="panel-heading"><h2>Recent sales <span className="count-badge">{sales.length}</span></h2><label className="compact-search"><span className="sr-only">Search sales</span><input type="search" placeholder="Receipt, product or SKU" value={filter} onChange={(event) => setFilter(event.target.value)} /></label></div>
      <div className="sales-list">{shown.map((sale) => <article className="sale-record" key={sale.id}>
        <div className="sale-record-heading"><div><strong>{sale.receipt_number}</strong><small>{new Date(sale.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {sale.payment_method}</small></div><span className={`status status-${sale.status}`}>{sale.status.replaceAll("_", " ")}</span><strong className="money">{formatMoney(sale.total_cents)}</strong></div>
        <div className="sale-line-summary">{sale.lines.map((line) => <div key={line.id}><span>{line.quantity} × {line.product_name}{line.refunded_quantity > 0 && <small> · {line.refunded_quantity} returned</small>}</span><span>{formatMoney(line.total_cents)}</span></div>)}</div>
        <div className="sale-record-footer"><span>Tax {formatMoney(sale.tax_cents)}{sale.discount_cents > 0 ? ` · Discount −${formatMoney(sale.discount_cents)}` : ""}{sale.refunded_total_cents > 0 ? ` · Refunded ${formatMoney(sale.refunded_total_cents)}` : ""}</span><div className="button-row"><Link className="button" href={`/receipts/${sale.id}`}>View receipt</Link>{sale.status !== "refunded" && <button onClick={() => openRefund(refundSale ?? sale)}>Refund / return</button>}</div></div>
      </article>)}</div>
      {!shown.length && <div className="empty-state"><h2>No sales found</h2><p>{sales.length ? "Try a different receipt, product or SKU." : "Complete the first sale in the register."}</p><Link href="/sale">Open register</Link></div>}
    </section>
  </>;
}
