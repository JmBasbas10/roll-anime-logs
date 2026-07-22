import { asBatch, eventTime, getServerConfig, hasValidIngestSecret, jsonError, optionalInteger, optionalString, positiveInteger, publicSupabaseError, readBoundedJson, requiredString, supabaseRequest } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = getServerConfig();
  if (!config.supabaseUrl || !config.supabaseKey || !config.ingestSecret) return jsonError("Event ingestion is not configured.", 503);
  if (!(await hasValidIngestSecret(request, config.ingestSecret))) return jsonError("Unauthorized.", 401);

  try {
    const input = asBatch(await readBoundedJson(request));
    const events = input.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_EVENT");
      const value = raw as Record<string, unknown>;
      const unit = value.unit;
      if (!unit || typeof unit !== "object" || Array.isArray(unit)) throw new Error("INVALID_UNIT");
      const unitValue = unit as Record<string, unknown>;
      return {
        gift_id: requiredString(value.giftId, "gift_id"),
        giver_id: positiveInteger(value.giverId, "giver_id"),
        giver_name: optionalString(value.giverName, "giver_name", 100),
        receiver_id: positiveInteger(value.receiverId, "receiver_id"),
        receiver_name: optionalString(value.receiverName, "receiver_name", 100),
        unit_name: requiredString(unitValue.name, "unit_name", 150),
        unit_level: optionalInteger(unitValue.level, "unit_level", 1, 1_000_000),
        unit_mutation: optionalString(unitValue.mutation, "unit_mutation", 100),
        unit_trait: optionalString(unitValue.trait, "unit_trait", 100),
        unit_uuid: optionalString(unitValue.uuid, "unit_uuid", 200),
        created_at: eventTime(value.createdAt, "created_at"),
        raw_payload: value,
      };
    });
    const response = await supabaseRequest("rpc/ingest_gift_events", { method: "POST", body: JSON.stringify({ p_events: events }) });
    if (!response.ok) {
      const failure = publicSupabaseError(response.status);
      return jsonError(failure.message, failure.status, failure.retry ? { "Retry-After": failure.retry } : undefined);
    }
    return Response.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "PAYLOAD_TOO_LARGE") return jsonError("Payload exceeds 256 KB.", 413);
    if (code === "INVALID_JSON") return jsonError("Request body must be valid JSON.", 400);
    if (code === "INVALID_BATCH_SIZE") return jsonError("Send between 1 and 100 gift events.", 400);
    return jsonError(`Invalid gift event: ${code.replace(/^INVALID_/, "").toLowerCase()}.`, 400);
  }
}
