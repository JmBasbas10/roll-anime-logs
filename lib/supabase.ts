type AppEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ROBLOX_INGEST_SECRET?: string;
};

export function getServerConfig() {
  const bindings = process.env as AppEnv;
  const supabaseUrl = bindings.SUPABASE_URL?.replace(/\/$/, "");
  const supabaseKey = bindings.SUPABASE_SECRET_KEY || bindings.SUPABASE_SERVICE_ROLE_KEY;
  return { supabaseUrl, supabaseKey, ingestSecret: bindings.ROBLOX_INGEST_SECRET };
}

export async function hasValidIngestSecret(request: Request, expected?: string) {
  if (!expected) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { supabaseUrl, supabaseKey } = getServerConfig();
  if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_NOT_CONFIGURED");
  const headers = new Headers(init.headers);
  headers.set("apikey", supabaseKey);
  headers.set("authorization", `Bearer ${supabaseKey}`);
  if (init.body) headers.set("content-type", "application/json");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
}

export function jsonError(message: string, status: number, extraHeaders?: HeadersInit) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

export async function readBoundedJson(request: Request, maxBytes = 256_000) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  try { return JSON.parse(text) as unknown; }
  catch { throw new Error("INVALID_JSON"); }
}

export function asBatch(value: unknown) {
  const batch = Array.isArray(value) ? value : [value];
  if (batch.length < 1 || batch.length > 100) throw new Error("INVALID_BATCH_SIZE");
  return batch;
}

export function requiredString(value: unknown, field: string, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`INVALID_${field.toUpperCase()}`);
  return value.trim();
}

export function optionalString(value: unknown, field: string, max = 150) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new Error(`INVALID_${field.toUpperCase()}`);
  return value;
}

export function positiveInteger(value: unknown, field: string, max = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) throw new Error(`INVALID_${field.toUpperCase()}`);
  return parsed;
}

export function optionalInteger(value: unknown, field: string, min: number, max: number) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`INVALID_${field.toUpperCase()}`);
  return parsed;
}

export function eventTime(value: unknown, field: string) {
  let date: Date;
  if (typeof value === "number") date = new Date(value < 10_000_000_000 ? value * 1000 : value);
  else if (typeof value === "string" && value.trim()) date = new Date(value);
  else throw new Error(`INVALID_${field.toUpperCase()}`);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp) || timestamp > Date.now() + 5 * 60_000 || timestamp < Date.now() - 366 * 24 * 60 * 60_000) throw new Error(`INVALID_${field.toUpperCase()}`);
  return date.toISOString();
}

export function publicSupabaseError(status: number) {
  if (status === 429) return { message: "Database is busy. Retry this batch.", status: 503, retry: "2" };
  if (status >= 500) return { message: "Database temporarily unavailable. Retry this batch.", status: 503, retry: "2" };
  return { message: "The event batch was rejected by the database.", status: 400 };
}
