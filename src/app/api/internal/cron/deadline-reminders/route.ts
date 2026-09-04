import { NextResponse } from "next/server";

import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { runDeadlineReminders } from "@/lib/notifications/reminder-repository";
import { isSenderConfigured } from "@/lib/notifications/whatsapp-sender";
import { verifyMachineBearer } from "@/lib/security/hmac";

/**
 * La pasada diaria de avisos de vencimiento.
 *
 * La dispara el cron de Vercel una vez al día. Va protegida por CRON_SECRET:
 * sin él responde 403, para que la URL no sea un botón público de mandar
 * mensajes a los teléfonos de otras personas.
 *
 * `?dryRun=1` calcula y responde qué mandaría sin mandar nada ni anotarlo, para
 * poder comprobar el resultado antes de que salga un solo mensaje.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization");
  return verifyMachineBearer(secret, header);
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const today = url.searchParams.get("today");
  const fecha = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined;

  try {
    const result = await runDeadlineReminders({ dryRun, today: fecha });
    return NextResponse.json({
      ...result,
      dryRun,
      senderConfigured: isSenderConfigured(),
      // Sin canal configurado no se anota nada: se dice, en vez de fingir que
      // los avisos salieron.
      note:
        !dryRun && !isSenderConfigured()
          ? "El canal de salida de WhatsApp no está configurado. No se ha enviado ni anotado ningún aviso."
          : undefined,
    });
  } catch (error) {
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

// El cron de Vercel usa GET; POST queda para dispararlo a mano.
export const GET = run;
export const POST = run;
