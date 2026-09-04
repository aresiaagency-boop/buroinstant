import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { issueLinkCode, readLinkState } from "@/lib/whatsapp-link-repository";
import { LINK_PREFIX, businessNumber, formatBusinessNumber, linkInstructions, waLink } from "@/lib/whatsapp-link";

/**
 * Vincular el WhatsApp con el expediente.
 *
 * GET dice en qué estado está. POST emite un código que la persona envía desde
 * su teléfono: escribir desde ese número es la prueba de que es suyo.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    const state = await readLinkState(actor);
    const numero = businessNumber();
    return NextResponse.json({
      ...state,
      prefix: LINK_PREFIX,
      // El destino: sin el numero, la instruccion no se puede seguir.
      businessNumber: numero,
      businessNumberLabel: numero ? formatBusinessNumber(numero) : null,
      waLink: numero && state.status === "PENDING" ? waLink(numero, state.code) : null,
      instructions: state.status === "PENDING" ? linkInstructions(state.code, numero) : null,
    });
  } catch (error) {
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

export async function POST() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (actor.mode !== "oauth") {
    return NextResponse.json(
      {
        error: "GOOGLE_SESSION_REQUIRED",
        message: "Vincular un teléfono con un expediente requiere una cuenta de Google.",
      },
      { status: 403 },
    );
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    const issued = await issueLinkCode(actor);
    const numero = businessNumber();
    return NextResponse.json({
      status: "PENDING",
      ...issued,
      prefix: LINK_PREFIX,
      businessNumber: numero,
      businessNumberLabel: numero ? formatBusinessNumber(numero) : null,
      waLink: numero ? waLink(numero, issued.code) : null,
      instructions: linkInstructions(issued.code, numero),
    });
  } catch (error) {
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
