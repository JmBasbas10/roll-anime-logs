import { PRODUCTS } from "../../../products";
import { asBatch, eventTime, getServerConfig, hasValidIngestSecret, jsonError, optionalInteger, optionalString, positiveInteger, publicSupabaseError, readBoundedJson, requiredString, supabaseRequest } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
const productNames = new Map(PRODUCTS.map((product) => [product.id, product.name]));

export async function POST(request: Request) {
  const config = getServerConfig();
  if (!config.supabaseUrl || !config.supabaseKey || !config.ingestSecret) return jsonError("Event ingestion is not configured.", 503);
  if (!(await hasValidIngestSecret(request, config.ingestSecret))) return jsonError("Unauthorized.", 401);

  try {
    const input = asBatch(await readBoundedJson(request));
    const events = input.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_EVENT");
      const value = raw as Record<string, unknown>;
      const productId = positiveInteger(value.productId, "product_id");
      return {
        receipt_id: requiredString(value.receiptId, "receipt_id"),
        player_id: positiveInteger(value.playerId, "player_id"),
        player_name: optionalString(value.playerName, "player_name", 100),
        product_id: productId,
        product_name: optionalString(value.productName, "product_name") || productNames.get(productId) || null,
        price_robux: optionalInteger(value.priceRobux, "price_robux", 0, 10_000_000),
        purchased_at: eventTime(value.purchasedAt, "purchased_at"),
        raw_payload: value,
      };
    });
    const response = await supabaseRequest("rpc/ingest_purchase_events", { method: "POST", body: JSON.stringify({ p_events: events }) });
    if (!response.ok) {
      const failure = publicSupabaseError(response.status);
      return jsonError(failure.message, failure.status, failure.retry ? { "Retry-After": failure.retry } : undefined);
    }
    return Response.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "PAYLOAD_TOO_LARGE") return jsonError("Payload exceeds 256 KB.", 413);
    if (code === "INVALID_JSON") return jsonError("Request body must be valid JSON.", 400);
    if (code === "INVALID_BATCH_SIZE") return jsonError("Send between 1 and 100 purchase events.", 400);
    return jsonError(`Invalid purchase event: ${code.replace(/^INVALID_/, "").toLowerCase()}.`, 400);
  }
}
