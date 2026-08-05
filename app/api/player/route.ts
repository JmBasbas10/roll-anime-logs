import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "../../../lib/auth";
import { validatePlayerData } from "../../../lib/player-data";
import { jsonError, readBoundedJson } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

type RobloxEnv = { ROBLOX_API_KEY?: string; ROBLOX_UNIVERSE_ID?: string; ROBLOX_DATASTORE_ID?: string; ROBLOX_DATASTORE_SCOPE?: string; ROBLOX_PLAYER_KEY_PREFIX?: string };

async function resolveUser(query: string) {
  if (/^\d+$/.test(query)) {
    const response = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(query)}`, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Roblox user lookup failed");
    const user = await response.json() as { id: number; name: string; displayName?: string };
    return { id: String(user.id), name: user.name, displayName: user.displayName };
  }
  const response = await fetch("https://users.roblox.com/v1/usernames/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usernames: [query], excludeBannedUsers: false }) });
  if (!response.ok) throw new Error("Roblox username lookup failed");
  const body = await response.json() as { data?: Array<{ id: number; name: string; displayName?: string }> };
  const user = body.data?.[0];
  return user ? { id: String(user.id), name: user.name, displayName: user.displayName } : null;
}

function datastorePath(userId: string, env: RobloxEnv) {
  const universeId = env.ROBLOX_UNIVERSE_ID || "10298144467";
  const datastoreId = env.ROBLOX_DATASTORE_ID || "TurnBaseLive";
  const datastoreScope = env.ROBLOX_DATASTORE_SCOPE || "global";
  const keyPrefix = env.ROBLOX_PLAYER_KEY_PREFIX || "PLAYER_";
  const entryId = `${keyPrefix}${userId}`;
  const path = ["https://apis.roblox.com/cloud/v2/universes", encodeURIComponent(universeId), "data-stores", encodeURIComponent(datastoreId), "scopes", encodeURIComponent(datastoreScope), "entries", encodeURIComponent(entryId)].join("/");
  return { path, entryId, datastoreId, datastoreScope };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const env = process.env as RobloxEnv;
  if (!query) return jsonError("Enter a Roblox username or user ID.", 400);
  if (!env.ROBLOX_API_KEY) return jsonError("ROBLOX_API_KEY is not configured on the server.", 503);
  try {
    const user = await resolveUser(query);
    if (!user) return jsonError("Roblox user not found.", 404);
    const target = datastorePath(user.id, env);
    const response = await fetch(target.path, { headers: { "x-api-key": env.ROBLOX_API_KEY, Accept: "application/json" }, cache: "no-store" });
    if (response.status === 404) return jsonError(`No saved profile was found for ${user.name}.`, 404);
    if (!response.ok) return jsonError(`Roblox Open Cloud returned HTTP ${response.status}.`, 502);
    const entry = await response.json() as { value?: unknown };
    const stored = entry.value ?? entry;
    const data = stored && typeof stored === "object" && "Data" in stored ? (stored as { Data: unknown }).Data : stored;
    return NextResponse.json({ user, entry: { id: target.entryId, datastore: target.datastoreId, scope: target.datastoreScope }, data });
  } catch {
    return jsonError("Could not reach Roblox. Please try again.", 502);
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;
  const env = process.env as RobloxEnv;
  if (!env.ROBLOX_API_KEY) return jsonError("ROBLOX_API_KEY is not configured on the server.", 503);
  try {
    const body = await readBoundedJson(request, 1_000_000);
    if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid save request.", 400);
    const value = body as { userId?: unknown; data?: unknown };
    if (typeof value.userId !== "string" || !/^\d+$/.test(value.userId)) return jsonError("A valid player user ID is required.", 400);
    const cleanData = validatePlayerData(value.data);
    const target = datastorePath(value.userId, env);
    const currentResponse = await fetch(target.path, { headers: { "x-api-key": env.ROBLOX_API_KEY, Accept: "application/json" }, cache: "no-store" });
    if (!currentResponse.ok) return jsonError(`Roblox Open Cloud returned HTTP ${currentResponse.status}.`, 502);
    const currentEntry = await currentResponse.json() as { value?: unknown };
    const currentValue = currentEntry.value ?? currentEntry;
    const nextValue = currentValue && typeof currentValue === "object" && !Array.isArray(currentValue) && "Data" in currentValue ? { ...currentValue, Data: cleanData } : cleanData;
    const saveResponse = await fetch(target.path, { method: "PATCH", headers: { "x-api-key": env.ROBLOX_API_KEY, Accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ value: nextValue }), cache: "no-store" });
    if (!saveResponse.ok) return jsonError(`Roblox update returned HTTP ${saveResponse.status}.`, 502);
    return NextResponse.json({ ok: true, data: cleanData }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Player data failed validation.";
    if (message === "PAYLOAD_TOO_LARGE") return jsonError("Player data exceeds the save limit.", 413);
    if (message === "INVALID_JSON") return jsonError("Request body must be valid JSON.", 400);
    return jsonError(message, 400);
  }
}
