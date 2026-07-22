import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
type RobloxEnv = { ROBLOX_API_KEY?: string; ROBLOX_UNIVERSE_ID?: string; ROBLOX_DATASTORE_ID?: string; ROBLOX_DATASTORE_SCOPE?: string; ROBLOX_PLAYER_KEY_PREFIX?: string };
type Revision = { id?: string; revisionId?: string; revisionCreateTime?: string; state?: string };

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId")?.trim();
  const requestedAt = request.nextUrl.searchParams.get("at")?.trim();
  if (!userId || !/^\d+$/.test(userId)) return NextResponse.json({ error: "A valid player user ID is required." }, { status: 400 });
  const target = requestedAt ? new Date(requestedAt) : null;
  if (!target || Number.isNaN(target.getTime())) return NextResponse.json({ error: "Choose a valid date and time." }, { status: 400 });

  const bindings = env as unknown as RobloxEnv;
  const apiKey = bindings.ROBLOX_API_KEY;
  const universeId = bindings.ROBLOX_UNIVERSE_ID || "10298144467";
  const datastoreId = bindings.ROBLOX_DATASTORE_ID || "TurnBaseLive";
  const scope = bindings.ROBLOX_DATASTORE_SCOPE || "global";
  const prefix = bindings.ROBLOX_PLAYER_KEY_PREFIX || "PLAYER_";
  if (!apiKey) return NextResponse.json({ error: "ROBLOX_API_KEY is not configured." }, { status: 503 });

  const entryId = `${prefix}${userId}`;
  const base = `https://apis.roblox.com/cloud/v2/universes/${encodeURIComponent(universeId)}/data-stores/${encodeURIComponent(datastoreId)}/scopes/${encodeURIComponent(scope)}/entries`;
  const headers = { "x-api-key": apiKey, Accept: "application/json" };

  try {
    let pageToken = "";
    let match: Revision | null = null;
    do {
      const listUrl = new URL(`${base}/${encodeURIComponent(entryId)}:listRevisions`);
      listUrl.searchParams.set("maxPageSize", "100");
      if (pageToken) listUrl.searchParams.set("pageToken", pageToken);
      const response = await fetch(listUrl, { headers, cache: "no-store" });
      if (response.status === 403) return NextResponse.json({ error: "The API key cannot list datastore revisions." }, { status: 502 });
      if (!response.ok) return NextResponse.json({ error: `Roblox revision lookup returned HTTP ${response.status}.` }, { status: 502 });
      const body = await response.json() as { dataStoreEntries?: Revision[]; nextPageToken?: string };
      match = (body.dataStoreEntries || []).find((revision) => revision.revisionCreateTime && new Date(revision.revisionCreateTime).getTime() <= target.getTime()) || null;
      pageToken = match ? "" : body.nextPageToken || "";
    } while (pageToken);

    if (!match?.id) return NextResponse.json({ error: "No saved revision exists at or before that date. Historical revisions normally expire after 30 days." }, { status: 404 });
    const revisionResponse = await fetch(`${base}/${encodeURIComponent(match.id)}`, { headers, cache: "no-store" });
    if (!revisionResponse.ok) return NextResponse.json({ error: `Roblox revision read returned HTTP ${revisionResponse.status}.` }, { status: 502 });
    const entry = await revisionResponse.json() as { value?: unknown };
    const stored = entry.value ?? entry;
    const profile = stored && typeof stored === "object" && "Data" in stored ? (stored as { Data: unknown }).Data : stored;
    return NextResponse.json({ data: profile, revision: { id: match.revisionId, savedAt: match.revisionCreateTime, requestedAt: target.toISOString() } });
  } catch {
    return NextResponse.json({ error: "Could not load historical player data from Roblox." }, { status: 502 });
  }
}
