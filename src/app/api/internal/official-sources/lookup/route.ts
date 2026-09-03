import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchOfficialSource,
  isAllowedOfficialUrl,
  searchOfficialSourceCatalog,
  toSourceReference,
} from "@/lib/official-sources";
import { verifyMachineBearer, verifyWebhookSignature } from "@/lib/security/hmac";
import { checkEphemeralRateLimit } from "@/lib/security/rate-limit";

/**
 * Consulta de fuente oficial para el agente de n8n.
 *
 * El agente de WhatsApp no tiene sesión de usuario, así que esta ruta usa la
 * misma prueba de origen máquina que la ingesta: firma HMAC o Bearer con
 * N8N_WEBHOOK_SECRET.
 *
 * La lista de dominios permitidos vive en el servidor, no en el prompt: el
 * modelo propone una pregunta, nunca una URL arbitraria. Si pide una URL
 * concreta, tiene que estar en la lista de sedes oficiales o se rechaza. Así el
 * mensaje de un tercero no puede convertir esta ruta en un proxy.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  question: z.string().trim().min(3).max(500),
  url: z.string().url().max(500).optional(),
});

export async function POST(request: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "LOOKUP_NOT_CONFIGURED" }, { status: 503 });
  }

  const rawBody = await request.text();
  const validSignature = verifyWebhookSignature({
    secret,
    timestamp: request.headers.get("x-orbe-timestamp"),
    signature: request.headers.get("x-orbe-signature"),
    rawBody,
  });
  const validBearer = verifyMachineBearer(secret, request.headers.get("authorization"));
  if (!validSignature && !validBearer) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const rate = checkEphemeralRateLimit("official-lookup", { limit: 60, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = schema.safeParse(JSON.parse(rawBody || "null"));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (parsed.data.url && !isAllowedOfficialUrl(parsed.data.url)) {
    return NextResponse.json(
      {
        error: "OFFICIAL_SOURCE_NOT_ALLOWED",
        message:
          "Esa dirección no pertenece a una sede oficial admitida. Solo consulto AEAT, BOE, CIRCE, Seguridad Social y Registro Mercantil.",
      },
      { status: 400 },
    );
  }

  const candidates = parsed.data.url
    ? [{ authority: "SEDE OFICIAL", title: parsed.data.url, url: parsed.data.url, keywords: [] as string[] }]
    : searchOfficialSourceCatalog(parsed.data.question).slice(0, 2);

  const consulted = await Promise.all(
    candidates.map(async (source) => {
      try {
        const snapshot = await fetchOfficialSource(source.url);
        return {
          authority: source.authority,
          title: snapshot.title,
          url: snapshot.url,
          fetchedAt: snapshot.fetchedAt,
          status: "VERIFIED" as const,
          excerpt: snapshot.normalizedText.slice(0, 2_500),
        };
      } catch (error) {
        return {
          authority: source.authority,
          title: source.title,
          url: source.url,
          fetchedAt: null,
          status: "UNAVAILABLE" as const,
          reason: error instanceof Error ? error.message : "OFFICIAL_SOURCE_UNAVAILABLE",
        };
      }
    }),
  );

  const verified = consulted.filter((entry) => entry.status === "VERIFIED");

  return NextResponse.json({
    question: parsed.data.question,
    consultedAt: new Date().toISOString(),
    sources: consulted,
    // Referencias en el formato que ya usa el expediente.
    references: searchOfficialSourceCatalog(parsed.data.question)
      .slice(0, 2)
      .map((source) => toSourceReference(source, verified[0]?.fetchedAt ?? null)),
    // Contrato explícito para el agente: sin fuente verificada, no hay afirmación.
    verdict: verified.length ? "SOURCE_VERIFIED" : "NO_VERIFIED_SOURCE",
    informationalOnly: true,
  });
}
