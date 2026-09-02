import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db, isDatabaseConfigured, toDatabaseJson } from "@/lib/db";
import { BusinessDataIngestionService } from "@/lib/ingestion";
import { resolveWhatsAppIdentity } from "@/lib/repository";
import { inboundMessageSchema, whatsappWebhookSchema } from "@/lib/schemas";
import { verifyMachineBearer, verifyWebhookSignature } from "@/lib/security/hmac";
import { checkEphemeralRateLimit } from "@/lib/security/rate-limit";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";

const service = new BusinessDataIngestionService();

export async function POST(request: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const configuredInstance = process.env.EVOLUTION_API_INSTANCE;
  if (!secret || !configuredInstance || !isDatabaseConfigured()) {
    return NextResponse.json({ error: "INGESTION_NOT_CONFIGURED" }, { status: 503 });
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-orbe-timestamp");
  const signature = request.headers.get("x-orbe-signature");
  const hasValidHmac = verifyWebhookSignature({ secret, timestamp, signature, rawBody });
  const hasValidBearer = verifyMachineBearer(secret, request.headers.get("authorization"));
  if (!hasValidHmac && !hasValidBearer) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const parsed = whatsappWebhookSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success || parsed.data.instance !== configuredInstance) {
    return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
  }
  const phone = normalizeWhatsAppPhone(parsed.data.phone);
  const rate = checkEphemeralRateLimit(`wa:${parsed.data.instance}:${phone}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const sql = db();
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const inserted = await sql`
    insert into webhook_events (provider, instance, external_event_id, payload_hash, status)
    values ('EVOLUTION_API', ${parsed.data.instance}, ${parsed.data.messageId}, ${payloadHash}, 'RECEIVED')
    on conflict (instance, external_event_id) do nothing
    returning id
  `;
  if (!inserted.length) {
    return NextResponse.json({ status: "DUPLICATE_EVENT" }, { status: 200 });
  }

  const identity = await resolveWhatsAppIdentity(phone);
  if (!identity) {
    await sql`
      update webhook_events set status = 'NEEDS_IDENTITY', processed_at = now()
      where id = ${inserted[0].id}
    `;
    return NextResponse.json(
      {
        status: "LINK_REQUIRED",
        replyText:
          "He recibido tu mensaje. Para asociarlo con tu expediente necesito vincular este número con tu cuenta BUROINSTANT.",
      },
      { status: 202 },
    );
  }

  const message = inboundMessageSchema.parse({
    channel: "WHATSAPP",
    inputType: parsed.data.type === "voice" ? "VOICE" : "TEXT",
    userId: identity.user_id,
    workspaceId: identity.workspace_id,
    projectId: identity.project_id ?? undefined,
    externalIdentity: {
      provider: "EVOLUTION_API",
      instance: parsed.data.instance,
      phone,
      messageId: parsed.data.messageId,
    },
    text: parsed.data.text,
    sourceTimestamp: parsed.data.timestamp,
  });
  const result = service.process(message);
  await sql.begin(async (transaction) => {
    await transaction`
      insert into data_ingestion_events (
        workspace_id, user_id, project_id, channel, input_type, external_message_id,
        raw_text, normalized_text, extracted_data, status, confidence,
        requires_confirmation, created_by
      ) values (
        ${identity.workspace_id}, ${identity.user_id}, ${identity.project_id}, 'WHATSAPP',
        ${message.inputType}, ${parsed.data.messageId}, ${parsed.data.text},
        ${parsed.data.text.trim()}, ${transaction.json(toDatabaseJson(result.extractedFields))},
        ${result.requiresConfirmation ? "NEEDS_CONFIRMATION" : "APPLIED"},
        ${result.extractedFields.length ? Math.min(...result.extractedFields.map((field) => field.confidence)) : 0},
        ${result.requiresConfirmation}, ${identity.user_id}
      )
    `;
    await transaction`
      update webhook_events set status = 'PROCESSED', processed_at = now()
      where id = ${inserted[0].id}
    `;
  });

  return NextResponse.json({
    status: result.requiresConfirmation ? "NEEDS_CONFIRMATION" : "APPLIED",
    extractedFields: result.extractedFields,
    contradictions: result.contradictions,
    replyText: result.suggestedNextQuestion,
  });
}
