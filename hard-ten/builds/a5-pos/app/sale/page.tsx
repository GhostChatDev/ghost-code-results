import { SaleWorkspace } from "@/components/sale-workspace";
import { listProducts } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function SalePage() {
  try {
    const products = await listProducts();
    return <SaleWorkspace products={products.filter((product) => product.active)} />;
  } catch (error) {
    return <section className="panel standalone-state"><p className="eyebrow">REGISTER OFFLINE</p><h1>Cannot open the register</h1>
      <p>{error instanceof Error ? error.message : "The database is unavailable."}</p>
      <p>Check DATABASE_URL, run <code>npm run db:migrate</code>, then reload this page.</p></section>;
  }
}
