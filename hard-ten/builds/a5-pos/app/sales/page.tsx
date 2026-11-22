import type { Metadata } from "next";
import { SalesManager } from "@/components/sales-manager";
import { listSales } from "@/lib/history";

export const metadata: Metadata = { title: "Sales · Tallyroom" };
export const dynamic = "force-dynamic";

export default async function SalesPage() {
  try {
    return <SalesManager sales={await listSales()} />;
  } catch {
    return <div className="page-heading"><div><p className="eyebrow">TRANSACTIONS</p><h1>Sales & refunds</h1><p>Sales could not be loaded. Check the database connection and run the migrations.</p></div></div>;
  }
}
