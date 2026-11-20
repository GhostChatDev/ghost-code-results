import { isMock, pushConfigured } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Public values only: the Supabase anon key and the VAPID PUBLIC key are meant for browsers. No secret is returned. */
export async function GET() {
  return Response.json({
    mock: isMock(),
    supabaseUrl: process.env.SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? null,
    vapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null,
    pushConfigured: pushConfigured(),
  }, { headers: { "Cache-Control": "no-store" } });
}
