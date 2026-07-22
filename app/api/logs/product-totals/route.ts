import { jsonError, supabaseRequest } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const params = new URLSearchParams({ select: "product_id,product_name,purchase_count,robux_total,last_purchased_at", order: "purchase_count.desc,product_id.asc", limit: "100" });
    const response = await supabaseRequest(`product_purchase_totals?${params}`);
    if (!response.ok) return jsonError("Could not load product totals.", 502);
    return Response.json({ rows: await response.json() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "SUPABASE_NOT_CONFIGURED") return jsonError("Supabase is not configured.", 503);
    return jsonError("Could not load product totals.", 502);
  }
}
