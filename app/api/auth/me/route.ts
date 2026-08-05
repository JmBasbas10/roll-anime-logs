import { getCurrentUser } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ user: await getCurrentUser() }, { headers: { "Cache-Control": "no-store" } });
}
