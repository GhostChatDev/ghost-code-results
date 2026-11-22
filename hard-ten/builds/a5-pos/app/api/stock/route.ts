import { NextResponse } from "next/server";
import { addStock } from "@/lib/catalog";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { productId?: string; kind?: "received" | "adjusted"; quantity?: number; reason?: string; requestKey?: string };
    if (!body.productId || !body.kind || !body.requestKey) return NextResponse.json({ error: "Product, movement type and request key are required." }, { status: 400 });
    await addStock(body.productId, body.kind, Number(body.quantity), body.reason ?? "", body.requestKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The movement could not be saved." }, { status: 400 });
  }
}
