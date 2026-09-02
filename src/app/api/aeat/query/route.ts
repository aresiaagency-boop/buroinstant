import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth";
import {
  fetchOfficialSource,
  searchOfficialSourceCatalog,
  toSourceReference,
} from "@/lib/official-sources";

const schema = z.object({
  projectId: z.string().uuid().optional(),
  question: z.string().trim().min(4).max(2_000),
  mode: z.literal("LIVE_OFFICIAL").default("LIVE_OFFICIAL"),
});

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const source = searchOfficialSourceCatalog(parsed.data.question)[0];
  try {
    const snapshot = await fetchOfficialSource(source.url);
    return NextResponse.json({
      answer:
        "La fuente oficial está disponible y ha sido verificada ahora. BUROINSTANT no emitirá una conclusión fiscal hasta que el razonamiento especializado esté configurado y la evidencia se vincule a tu expediente.",
      personalizedContext: [],
      actions: [{ label: "Abrir fuente oficial", url: snapshot.url }],
      missingInformation: ["Contexto completo del expediente", "Proveedor de razonamiento configurado"],
      sources: [toSourceReference(source, snapshot.fetchedAt)],
      confidence: 0,
      authority: "NO_VERIFIED_ANSWER",
      informationalOnly: true,
    });
  } catch {
    return NextResponse.json(
      {
        error: "OFFICIAL_SOURCE_UNAVAILABLE",
        message: "No he podido verificar esta información en AEAT en este momento.",
        options: ["RETRY", "OPEN_AEAT", "SAVE_QUERY"],
        sources: [toSourceReference(source, null)],
      },
      { status: 503 },
    );
  }
}
