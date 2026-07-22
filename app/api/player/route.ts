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

async function resolveUser(query: string) {
  if (/^\d+$/.test(query)) {
    const response = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(query)}`, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Roblox user lookup failed");
    const user = (await response.json()) as { id: number; name: string; displayName?: string };
    return { id: String(user.id), name: user.name, displayName: user.displayName };
  }

  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [query], excludeBannedUsers: false }),
  });
  if (!response.ok) throw new Error("Roblox username lookup failed");
  const body = (await response.json()) as { data?: Array<{ id: number; name: string; displayName?: string }> };
  const user = body.data?.[0];
  if (!user) return null;
  return { id: String(user.id), name: user.name, displayName: user.displayName };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const bindings = env as unknown as RobloxEnv;
  const apiKey = bindings.ROBLOX_API_KEY;
  const universeId = bindings.ROBLOX_UNIVERSE_ID || "10298144467";
  const datastoreId = bindings.ROBLOX_DATASTORE_ID || "TurnBaseLive";
  const datastoreScope = bindings.ROBLOX_DATASTORE_SCOPE || "global";
  const keyPrefix = bindings.ROBLOX_PLAYER_KEY_PREFIX || "PLAYER_";

  if (!query) return NextResponse.json({ error: "Enter a Roblox username or user ID." }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "ROBLOX_API_KEY is not configured on the server." }, { status: 503 });

  try {
    const user = await resolveUser(query);
    if (!user) return NextResponse.json({ error: "Roblox user not found." }, { status: 404 });

    const entryId = `${keyPrefix}${user.id}`;
    const path = [
      "https://apis.roblox.com/cloud/v2/universes",
      encodeURIComponent(universeId),
      "data-stores",
      encodeURIComponent(datastoreId),
      "scopes",
      encodeURIComponent(datastoreScope),
      "entries",
      encodeURIComponent(entryId),
    ].join("/");

    const response = await fetch(path, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      cache: "no-store",
    });

    if (response.status === 404) return NextResponse.json({ error: `No saved profile was found for ${user.name}.` }, { status: 404 });
    if (response.status === 401) return NextResponse.json({ error: "Roblox rejected the API key. Generate a new key and update .env.local." }, { status: 502 });
    if (response.status === 403) return NextResponse.json({ error: "The API key does not have read access to this datastore." }, { status: 502 });
    if (!response.ok) return NextResponse.json({ error: `Roblox Open Cloud returned HTTP ${response.status}.` }, { status: 502 });

    const entry = (await response.json()) as { value?: unknown };
    const stored = entry.value ?? entry;
    const profile = stored && typeof stored === "object" && "Data" in stored ? (stored as { Data: unknown }).Data : stored;

    return NextResponse.json({
      user,
      entry: { id: entryId, datastore: datastoreId, scope: datastoreScope },
      data: profile,
    });
  } catch (error) {
    console.error("Player lookup failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not reach Roblox. Please try again." }, { status: 502 });
  }
}
