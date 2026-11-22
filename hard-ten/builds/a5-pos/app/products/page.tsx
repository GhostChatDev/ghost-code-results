import { ProductManager } from "@/components/product-manager";
import { listProducts } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await listProducts("", true);
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Catalog</span><h1>Products</h1><p>Prices, barcodes, tax rules and stock thresholds in one place.</p></div>
      </div>
      <ProductManager initialProducts={products} />
    </>
  );
}
