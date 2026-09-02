import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor, isSuperAdmin } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { setQualityFlag } from "@/lib/admin-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  queryId: z.string().uuid(),
  flag: z.enum(["CORRECT", "PARTIAL", "INCORRECT", "OUTDATED_SOURCE"]),
});

export async function PATCH(request: Request) {
  const actor = await getCurrentActor();
  if (!actor || !isSuperAdmin(actor) || !isDatabaseConfigured()) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 422 });

  try {
    await setQualityFlag({ ...parsed.data, actorEmail: actor.email });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
