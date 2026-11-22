import { NextResponse } from "next/server";
import { completeSale, type CartLine } from "@/lib/sales";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { lines?: CartLine[]; discountCents?: number; paymentMethod?: "cash" | "card"; requestKey?: string };
    if (!Array.isArray(body.lines) || body.paymentMethod !== "cash" && body.paymentMethod !== "card" || !body.requestKey) {
      return NextResponse.json({ error: "Sale lines, payment method and request key are required." }, { status: 400 });
    }
    const saleId = await completeSale(body.lines, body.discountCents ?? 0, body.paymentMethod, body.requestKey);
    return NextResponse.json({ saleId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The sale could not be completed." }, { status: 400 });
  }
}
