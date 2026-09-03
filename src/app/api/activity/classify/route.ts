import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth";
import { classifyActivity } from "@/lib/activity-classifier";

/**
 * Clasificación de una actividad descrita en la conversación, sin necesidad de
 * que el expediente esté todavía guardado. Sirve al panel del Orbe desde el
 * primer mensaje.
 *
 * Requiere sesión: la clasificación forma parte del expediente de alguien.
 */

export const runtime = "nodejs";

const schema = z.object({
  description: z.string().trim().min(3).max(3_000),
  municipality: z.string().trim().max(160).nullish(),
  hasPremises: z.boolean().nullish(),
  onlineActivity: z.boolean().nullish(),
  willHireWorkers: z.boolean().nullish(),
  euOperations: z.boolean().nullish(),
  nonEuOperations: z.boolean().nullish(),
  ecommerce: z.boolean().nullish(),
});

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const classification = classifyActivity(parsed.data);
  return NextResponse.json({
    ...classification,
    orbEvent: classification.sector === "SIN_DETERMINAR" ? "NO_VERIFIED_SOURCE" : "ACTIVITY_CLASSIFIED",
  });
}
