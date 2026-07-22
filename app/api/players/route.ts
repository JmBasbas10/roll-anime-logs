import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type RobloxEnv = {
  ROBLOX_API_KEY?: string;
  ROBLOX_UNIVERSE_ID?: string;
  ROBLOX_DATASTORE_ID?: string;
  ROBLOX_DATASTORE_SCOPE?: string;
  ROBLOX_PLAYER_KEY_PREFIX?: string;
};

export async function GET(request: NextRequest) {
  const bindings = env as unknown as RobloxEnv;
  const apiKey = bindings.ROBLOX_API_KEY;
  const universeId = bindings.ROBLOX_UNIVERSE_ID || "10298144467";
  const datastoreId = bindings.ROBLOX_DATASTORE_ID || "TurnBaseLive";
  const scope = bindings.ROBLOX_DATASTORE_SCOPE || "global";
  const prefix = bindings.ROBLOX_PLAYER_KEY_PREFIX || "PLAYER_";
  const requestedSize = Number(request.nextUrl.searchParams.get("pageSize") || "10");
  const pageSize = [10, 25, 50, 100].includes(requestedSize) ? requestedSize : 10;
  const pageToken = request.nextUrl.searchParams.get("pageToken") || "";

  if (!apiKey) return NextResponse.json({ error: "ROBLOX_API_KEY is not configured." }, { status: 503 });

  const url = new URL(`https://apis.roblox.com/cloud/v2/universes/${encodeURIComponent(universeId)}/data-stores/${encodeURIComponent(datastoreId)}/scopes/${encodeURIComponent(scope)}/entries`);
  url.searchParams.set("maxPageSize", String(pageSize));
  url.searchParams.set("filter", `id.startsWith(\"${prefix}\")`);
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  try {
    const response = await fetch(url, { headers: { "x-api-key": apiKey, Accept: "application/json" }, cache: "no-store" });
    if (response.status === 401) return NextResponse.json({ error: "Roblox rejected the API key." }, { status: 502 });
    if (response.status === 403) return NextResponse.json({ error: "The API key needs List Data Store Entries permission." }, { status: 502 });
    if (!response.ok) return NextResponse.json({ error: `Roblox Open Cloud returned HTTP ${response.status}.` }, { status: 502 });

    const body = (await response.json()) as { dataStoreEntries?: Array<{ path?: string; id?: string }>; nextPageToken?: string };
    const playerEntries = (body.dataStoreEntries || []).map((entry) => {
      const entryId = entry.id || entry.path?.split("/").pop() || "";
      return { userId: entryId.startsWith(prefix) ? entryId.slice(prefix.length) : entryId, entryId, scope };
    }).filter((player) => /^\d+$/.test(player.userId));

    const usersResponse = playerEntries.length ? await fetch("https://users.roblox.com/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: playerEntries.map((player) => Number(player.userId)), excludeBannedUsers: false }),
    }) : null;
    const usersBody = usersResponse?.ok
      ? await usersResponse.json() as { data?: Array<{ id: number; name: string; displayName: string }> }
      : { data: [] };
    const usersById = new Map((usersBody.data || []).map((user) => [String(user.id), user]));
    const players = playerEntries.map((player) => {
      const user = usersById.get(player.userId);
      return { ...player, username: user?.name || null, displayName: user?.displayName || null };
    });

    return NextResponse.json({ players, nextPageToken: body.nextPageToken || null, datastore: datastoreId, pageSize });
  } catch {
    return NextResponse.json({ error: "Could not reach Roblox. Please try again." }, { status: 502 });
  }
}
