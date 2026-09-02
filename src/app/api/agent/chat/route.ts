import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { BusinessDataIngestionService } from "@/lib/ingestion";
import { persistIngestion } from "@/lib/repository";
import { agentChatSchema, inboundMessageSchema } from "@/lib/schemas";

const service = new BusinessDataIngestionService();

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  const parsed = agentChatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const message = inboundMessageSchema.parse({
    channel: "WEB",
    inputType: parsed.data.inputType,
    userId: actor.mode === "oauth" && /^[0-9a-f-]{36}$/i.test(actor.userId) ? actor.userId : undefined,
    projectId: parsed.data.projectId,
    text: parsed.data.text,
    sourceTimestamp: new Date().toISOString(),
  });
  const result = service.process(message);
  let persistence: "PERSISTED" | "LOCAL_PREVIEW" | "FAILED" = "LOCAL_PREVIEW";

  if (isDatabaseConfigured()) {
    try {
      await persistIngestion({ actor, message, fields: result.extractedFields, projectId: parsed.data.projectId });
      persistence = "PERSISTED";
    } catch {
      persistence = "FAILED";
    }
  }

  return NextResponse.json({
    ...result,
    persistence,
    message:
      result.extractedFields.length > 1
        ? "He convertido tu explicación en datos del expediente. Revisa los campos propuestos antes de incorporarlos."
        : "He guardado la descripción. Necesito una precisión más para continuar.",
  });
}
