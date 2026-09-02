import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { ProjectAccessError, readCompleteness } from "@/lib/task-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });

  const { id } = await context.params;
  try {
    return NextResponse.json(await readCompleteness(actor, id));
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
