import { NextResponse } from "next/server";
import { saveProduct, type ProductInput } from "@/lib/catalog";

export async function POST(request: Request) {
  try {
    const body = await request.json() as ProductInput & { id?: string };
    const id = await saveProduct(body, body.id);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The product could not be saved." }, { status: 400 });
  }
}
