const MAX_BODY_BYTES = 256_000;
const MAX_BATCH_SIZE = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function secretsMatch(received: string, expected: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function requiredString(value: unknown, field: string, maxLength = 200) {
  const result = String(value ?? "").trim();
  if (!result || result.length > maxLength) throw new Error(`Invalid ${field}`);
  return result;
}

function optionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  const result = String(value).trim();
  if (!result || result.length > maxLength) throw new Error("Invalid string field");
  return result;
}

function integer(value: unknown, field: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`Invalid ${field}`);
  }
  return result;
}

function timestamp(value: unknown, field: string) {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid ${field}`);
  return date.toISOString();
}

function normalizePurchase(event: Record<string, unknown>) {
  return {
    receipt_id: requiredString(event.receiptId ?? event.receipt_id, "receiptId"),
    player_id: integer(event.playerId ?? event.player_id, "playerId", 1),
    player_name: optionalString(event.playerName ?? event.player_name, 100),
    product_id: integer(event.productId ?? event.product_id, "productId", 1),
    product_name: optionalString(event.productName ?? event.product_name, 150),
    price_robux: event.priceRobux === undefined && event.price_robux === undefined
      ? null
      : integer(event.priceRobux ?? event.price_robux, "priceRobux", 0, 10_000_000),
    purchased_at: timestamp(event.purchasedAt ?? event.purchased_at, "purchasedAt"),
    raw_payload: event,
  };
}

function normalizeGift(event: Record<string, unknown>) {
  const unit = (event.unit ?? event.Unit ?? {}) as Record<string, unknown>;
  return {
    gift_id: requiredString(event.giftId ?? event.gift_id ?? event.Id, "giftId"),
    giver_id: integer(event.giverId ?? event.giver_id ?? event.GiverId, "giverId", 1),
    giver_name: optionalString(event.giverName ?? event.giver_name ?? event.GiverName, 100),
    receiver_id: integer(event.receiverId ?? event.receiver_id ?? event.ReceiverId, "receiverId", 1),
    receiver_name: optionalString(event.receiverName ?? event.receiver_name ?? event.ReceiverName, 100),
    unit_name: requiredString(event.unitName ?? event.unit_name ?? unit.Name, "unitName", 150),
    unit_level: event.unitLevel === undefined && event.unit_level === undefined && unit.Level === undefined
      ? null
      : integer(event.unitLevel ?? event.unit_level ?? unit.Level, "unitLevel", 1, 1_000_000),
    unit_mutation: optionalString(event.unitMutation ?? event.unit_mutation ?? unit.Mutation, 100),
    unit_trait: optionalString(event.unitTrait ?? event.unit_trait ?? unit.Trait, 100),
    unit_uuid: optionalString(event.unitUuid ?? event.unit_uuid ?? unit.UUID, 200),
    created_at: timestamp(event.createdAt ?? event.created_at ?? event.Time, "createdAt"),
    raw_payload: event,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("ROBLOX_INGEST_SECRET") ?? "";
  const receivedSecret = request.headers.get("x-api-key") ?? "";
  if (!expectedSecret || !(await secretsMatch(receivedSecret, expectedSecret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return json({ error: "Request too large" }, 413);
    }

    const body = JSON.parse(text) as { kind?: unknown; events?: unknown };
    if ((body.kind !== "purchase" && body.kind !== "gift") || !Array.isArray(body.events)) {
      return json({ error: "Expected kind and events" }, 400);
    }
    if (body.events.length < 1 || body.events.length > MAX_BATCH_SIZE) {
      return json({ error: `Batch must contain 1-${MAX_BATCH_SIZE} events` }, 400);
    }

    const normalized = body.events.map((event) => {
      if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Invalid event");
      return body.kind === "purchase"
        ? normalizePurchase(event as Record<string, unknown>)
        : normalizeGift(event as Record<string, unknown>);
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase environment is unavailable");

    const rpc = body.kind === "purchase" ? "ingest_purchase_events" : "ingest_gift_events";
    const result = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_events: normalized }),
    });
    const resultText = await result.text();
    if (!result.ok) {
      console.error(`RPC ${rpc} failed (${result.status}): ${resultText.slice(0, 500)}`);
      return json({ error: "Database write failed" }, 503);
    }
    return json({ ok: true, result: resultText ? JSON.parse(resultText) : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return json({ error: message }, 400);
  }
});
