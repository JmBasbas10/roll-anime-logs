import { getServerConfig } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getServerConfig();
  return Response.json({
    ok: true,
    robloxOpenCloudConfigured: Boolean(process.env.ROBLOX_API_KEY),
    supabaseConfigured: Boolean(config.supabaseUrl && config.supabaseKey),
    ingestionConfigured: Boolean(config.ingestSecret),
  }, { headers: { "Cache-Control": "no-store" } });
}
