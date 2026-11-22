import { StockManager } from "@/components/stock-manager";
import { listMovements, listProducts, lowStock } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const [products, movements, low] = await Promise.all([listProducts(), listMovements(), lowStock()]);
  return <>
    <div className="page-heading"><div><span className="eyebrow">Inventory</span><h1>Stock ledger</h1><p>Every unit is explained. Stock is the sum of these movements, never an edited number.</p></div></div>
    <StockManager products={products} movements={movements} low={low} />
  </>;
}
