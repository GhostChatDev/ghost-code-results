import { api } from "@/lib/server/api";
import { exportAll } from "@/lib/core/service";

export const GET = api("export", 10, async (c) => {
  const { json, markdown } = await exportAll(c.db, c.userId);
  if (c.url.searchParams.get("format") === "md") {
    return new Response(markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="confirm-and-remind.md"', "Cache-Control": "no-store" } });
  }
  return new Response(JSON.stringify(json, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="confirm-and-remind.json"', "Cache-Control": "no-store" } });
});
