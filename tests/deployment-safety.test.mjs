import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("ingestion routes require authentication and bounded batches", async () => {
  const [helper, purchases, gifts] = await Promise.all([
    read("../lib/supabase.ts"),
    read("../app/api/events/purchase/route.ts"),
    read("../app/api/events/gift/route.ts"),
  ]);

  assert.match(helper, /Authorization|authorization/);
  assert.match(helper, /SHA-256/);
  assert.match(helper, /maxBytes = 256_000/);
  assert.match(helper, /batch\.length > 100/);
  assert.match(purchases, /hasValidIngestSecret/);
  assert.match(gifts, /hasValidIngestSecret/);
  assert.doesNotMatch(purchases + gifts, /NEXT_PUBLIC_SUPABASE_SECRET/);
});

test("database migration is idempotent and indexed", async () => {
  const migration = await read("../supabase/migrations/202607220001_realtime_logs.sql");
  assert.match(migration, /receipt_id text primary key/);
  assert.match(migration, /gift_id text primary key/);
  assert.match(migration, /on conflict \(receipt_id\) do nothing/);
  assert.match(migration, /on conflict \(gift_id\) do nothing/);
  assert.match(migration, /product_purchase_totals/);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /security definer/g);
  assert.match(migration, /revoke all on function/);
});

test("secret environment variables remain server-only", async () => {
  const example = await read("../.env.example");
  assert.match(example, /SUPABASE_SECRET_KEY=/);
  assert.match(example, /ROBLOX_INGEST_SECRET=/);
  assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
});
