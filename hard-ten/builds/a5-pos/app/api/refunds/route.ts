import { NextResponse } from "next/server";
import { refundSale, type RefundLine } from "@/lib/sales";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { saleId?: string; lines?: RefundLine[]; reason?: string; requestKey?: string };
    if (!body.saleId || !Array.isArray(body.lines) || !body.reason?.trim() || !body.requestKey) {
      return NextResponse.json({ error: "Sale, refund lines, reason and request key are required." }, { status: 400 });
    }
    const refundId = await refundSale(body.saleId, body.lines, body.reason, body.requestKey);
    return NextResponse.json({ refundId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The refund could not be saved." }, { status: 400 });
  }
}
