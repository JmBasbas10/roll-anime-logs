import { jsonError, supabaseRequest } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = Math.min(1000, Math.max(1, Number(url.searchParams.get("page")) || 1));
    const pageSize = [10, 25, 50, 100].includes(Number(url.searchParams.get("pageSize"))) ? Number(url.searchParams.get("pageSize")) : 10;
    const offset = (page - 1) * pageSize;
    const params = new URLSearchParams({
      select: "receipt_id,player_id,player_name,product_id,product_name,price_robux,purchased_at",
      order: "purchased_at.desc,receipt_id.desc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const search = url.searchParams.get("q")?.trim();
    if (search) {
      const safe = search.replace(/[,*()]/g, "").slice(0, 100);
      if (/^\d+$/.test(safe)) params.set("or", `(player_id.eq.${safe},product_id.eq.${safe})`);
      else params.set("or", `(player_name.ilike.*${safe}*,product_name.ilike.*${safe}*)`);
    }
    const response = await supabaseRequest(`purchase_logs?${params}`, { headers: { Prefer: "count=estimated" } });
    if (!response.ok) return jsonError("Could not load purchase logs.", 502);
    const total = Number(response.headers.get("content-range")?.split("/")[1]) || 0;
    return Response.json({ rows: await response.json(), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "SUPABASE_NOT_CONFIGURED") return jsonError("Supabase is not configured.", 503);
    return jsonError("Could not load purchase logs.", 502);
  }
}
