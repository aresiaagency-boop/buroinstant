import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { TASK_STATUSES } from "@/lib/task-engine";
import {
  EvidenceRequiredError,
  ProjectAccessError,
  listTasks,
  syncTasks,
  updateTaskStatus,
} from "@/lib/task-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  code: z.string().trim().min(2).max(64),
  status: z.enum(TASK_STATUSES),
  evidence: z.string().trim().min(3).max(500).optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });

  const { id } = await context.params;
  try {
    const existing = await listTasks(actor, id);
    const tasks = existing.length > 0 ? existing : await syncTasks(actor, id);
    return NextResponse.json({ tasks, orbEvent: "TASK_CREATED" });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });

  const { id } = await context.params;
  try {
    return NextResponse.json({ tasks: await syncTasks(actor, id), orbEvent: "TASK_CREATED" });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });

  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await updateTaskStatus({ actor, projectId: id, ...parsed.data });
    return NextResponse.json({
      ok: true,
      ...result,
      orbEvent: parsed.data.status === "COMPLETED" ? "TASK_COMPLETED" : "CASE_STAGE_CHANGED",
    });
  } catch (error) {
    if (error instanceof EvidenceRequiredError) {
      return NextResponse.json(
        {
          error: "EVIDENCE_REQUIRED",
          message: "Un trámite no se marca como completado sin evidencia que lo acredite.",
        },
        { status: 422 },
      );
    }
    if (error instanceof ProjectAccessError) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
