import { jsonError, supabaseRequest } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = Math.min(1000, Math.max(1, Number(url.searchParams.get("page")) || 1));
    const pageSize = [10, 25, 50, 100].includes(Number(url.searchParams.get("pageSize"))) ? Number(url.searchParams.get("pageSize")) : 10;
    const offset = (page - 1) * pageSize;
    const params = new URLSearchParams({
      select: "gift_id,giver_id,giver_name,receiver_id,receiver_name,unit_name,unit_level,unit_mutation,unit_trait,unit_uuid,created_at",
      order: "created_at.desc,gift_id.desc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const search = url.searchParams.get("q")?.trim();
    if (search) {
      const safe = search.replace(/[,*()]/g, "").slice(0, 100);
      if (/^\d+$/.test(safe)) params.set("or", `(giver_id.eq.${safe},receiver_id.eq.${safe})`);
      else params.set("or", `(giver_name.ilike.*${safe}*,receiver_name.ilike.*${safe}*,unit_name.ilike.*${safe}*)`);
    }
    const response = await supabaseRequest(`gift_logs?${params}`, { headers: { Prefer: "count=estimated" } });
    if (!response.ok) return jsonError("Could not load gift logs.", 502);
    const total = Number(response.headers.get("content-range")?.split("/")[1]) || 0;
    return Response.json({ rows: await response.json(), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "SUPABASE_NOT_CONFIGURED") return jsonError("Supabase is not configured.", 503);
    return jsonError("Could not load gift logs.", 502);
  }
}
