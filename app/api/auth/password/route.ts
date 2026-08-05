import { createSession, validPasswordLogin } from "../../../../lib/auth";
import { jsonError, readBoundedJson } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 16_000);
    if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid login request.", 400);
    const value = body as Record<string, unknown>;
    const user = await validPasswordLogin(value.username, value.password);
    if (!user) return jsonError("Invalid username or password.", 401);
    await createSession(user);
    return Response.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("Invalid login request.", 400);
  }
}
