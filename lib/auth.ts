import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jsonError, supabaseRequest } from "./supabase";

export type AuthUser = {
  id: string;
  username?: string;
  displayName?: string;
};

const sessionCookie = "rollwatch_session";
const textEncoder = new TextEncoder();

export function getAuthConfig() {
  const adminRobloxId = process.env.ADMIN_ROBLOX_ID || "10680528140";
  return {
    sessionSecret: process.env.AUTH_SESSION_SECRET,
    adminUsername: process.env.ADMIN_USERNAME || "AnotherSlop67",
    adminPassword: process.env.ADMIN_PASSWORD || "",
    adminRobloxId,
    rootAdminIds: new Set((process.env.ROOT_ADMIN_ROBLOX_IDS || adminRobloxId).split(",").map((id) => id.trim()).filter(Boolean)),
  };
}

export async function validPasswordLogin(username: unknown, password: unknown) {
  const config = getAuthConfig();
  if (!config.adminPassword || !config.sessionSecret) return null;
  if (typeof username !== "string" || typeof password !== "string") return null;
  if (!(await timingSafeEqual(username, config.adminUsername))) return null;
  if (!(await timingSafeEqual(password, config.adminPassword))) return null;
  return { id: config.adminRobloxId, username: config.adminUsername, displayName: config.adminUsername };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(sessionCookie)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireAdmin(returnTo = "/") {
  const user = await getCurrentUser();
  if (user && await userIsAuthorized(user.id)) return user;
  redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function requireAdminRequest() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Sign in first.", 401);
  if (!(await userIsAuthorized(user.id))) return jsonError("This account is not authorized.", 403);
  return user;
}

export async function userIsAuthorized(userId: string) {
  const config = getAuthConfig();
  if (config.rootAdminIds.has(userId)) return true;
  try {
    const params = new URLSearchParams({ select: "roblox_id", roblox_id: `eq.${userId}`, active: "eq.true", limit: "1" });
    const response = await supabaseRequest(`admin_users?${params}`);
    if (!response.ok) return false;
    const rows = await response.json() as Array<{ roblox_id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function createSession(user: AuthUser) {
  const token = await signSession(user);
  const store = await cookies();
  store.set(sessionCookie, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(sessionCookie);
}

async function signSession(user: AuthUser) {
  const payload = base64Url(textEncoder.encode(JSON.stringify({ user, expiresAt: Date.now() + 12 * 60 * 60_000 })));
  const signature = await hmac(payload);
  return `${payload}.${signature}`;
}

async function verifySession(token: string): Promise<AuthUser | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!(await timingSafeEqual(signature, await hmac(payload)))) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as { user?: AuthUser; expiresAt?: number };
    if (!body.user?.id || !body.expiresAt || body.expiresAt < Date.now()) return null;
    return body.user;
  } catch {
    return null;
  }
}

async function hmac(value: string) {
  const secret = getAuthConfig().sessionSecret;
  if (!secret) throw new Error("AUTH_SESSION_SECRET is required.");
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value))));
}

async function timingSafeEqual(left: string, right: string) {
  const a = textEncoder.encode(left);
  const b = textEncoder.encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

function base64Url(value: Uint8Array) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
