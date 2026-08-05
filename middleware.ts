import { NextRequest, NextResponse } from "next/server";

const protectedPages = ["/players", "/purchases", "/gifts", "/admin"];
const protectedApis = ["/api/player", "/api/players", "/api/player-history", "/api/logs", "/api/admin"];
const sessionCookie = "rollwatch_session";
const textEncoder = new TextEncoder();

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needsPageAuth = path === "/" || protectedPages.some((prefix) => path.startsWith(prefix));
  const needsApiAuth = protectedApis.some((prefix) => path.startsWith(prefix));
  if (!needsPageAuth && !needsApiAuth) return NextResponse.next();

  const token = request.cookies.get(sessionCookie)?.value || "";
  if (await verifySession(token)) return NextResponse.next();

  if (needsApiAuth) return NextResponse.json({ error: "Sign in with an authorized account." }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("returnTo", `${path}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|file.svg|globe.svg|window.svg).*)"],
};

async function verifySession(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !process.env.AUTH_SESSION_SECRET) return false;
  const expected = await hmac(payload);
  if (!timingSafeEqual(signature, expected)) return false;

  try {
    const body = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as { user?: { id?: string }; expiresAt?: number };
    return Boolean(body.user?.id && body.expiresAt && body.expiresAt > Date.now());
  } catch {
    return false;
  }
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(process.env.AUTH_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value))));
}

function timingSafeEqual(left: string, right: string) {
  const a = textEncoder.encode(left);
  const b = textEncoder.encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

function base64Url(value: Uint8Array) {
  let binary = "";
  for (let index = 0; index < value.length; index += 1) binary += String.fromCharCode(value[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
