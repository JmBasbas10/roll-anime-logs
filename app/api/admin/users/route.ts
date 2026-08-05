import { requireAdminRequest } from "../../../../lib/auth";
import { jsonError, positiveInteger, readBoundedJson, requiredString, supabaseRequest } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;
  try {
    const params = new URLSearchParams({ select: "roblox_id,username,added_by,created_at,active", order: "created_at.desc" });
    const response = await supabaseRequest(`admin_users?${params}`);
    if (!response.ok) return jsonError("Could not load authorized users.", 502);
    return Response.json({ rows: await response.json() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "SUPABASE_NOT_CONFIGURED") return jsonError("Supabase is required for the admin list.", 503);
    return jsonError("Could not load authorized users.", 502);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;
  try {
    const body = await readBoundedJson(request, 16_000);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_REQUEST");
    const value = body as Record<string, unknown>;
    const robloxId = String(positiveInteger(value.robloxId, "roblox_id"));
    const username = value.username === undefined || value.username === null || value.username === "" ? null : requiredString(value.username, "username", 100);
    const response = await supabaseRequest("admin_users", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify([{ roblox_id: robloxId, username, added_by: admin.id, active: true }]) });
    if (!response.ok) return jsonError("Could not save authorized user.", 502);
    return Response.json({ row: (await response.json())[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "SUPABASE_NOT_CONFIGURED") return jsonError("Supabase is required for the admin list.", 503);
    return jsonError("Enter a valid Roblox user ID.", 400);
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;
  try {
    const url = new URL(request.url);
    const robloxId = String(positiveInteger(url.searchParams.get("robloxId"), "roblox_id"));
    const response = await supabaseRequest(`admin_users?roblox_id=eq.${robloxId}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ active: false }) });
    if (!response.ok) return jsonError("Could not remove authorized user.", 502);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("Enter a valid Roblox user ID.", 400);
  }
}
