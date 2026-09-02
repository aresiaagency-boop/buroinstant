import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor, isSuperAdmin, isSuperAdminEmail } from "@/lib/auth";
import { isDatabaseConfigured, redactDatabaseError } from "@/lib/db";
import { deleteUser, listUsers, setUserAccountStatus } from "@/lib/admin-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().max(280).optional(),
});

const deleteSchema = z.object({ userId: z.string().uuid() });

async function guard() {
  const actor = await getCurrentActor();
  if (!actor || !isSuperAdmin(actor)) return null;
  if (!isDatabaseConfigured()) return null;
  return actor;
}

/** Impide que un superadministrador se degrade o se borre a sí mismo por error. */
async function protectsSuperAdmin(userId: string) {
  const users = await listUsers(500);
  const target = users.find((user) => user.id === userId);
  return Boolean(target && isSuperAdminEmail(target.email));
}

export async function PATCH(request: Request) {
  const actor = await guard();
  if (!actor) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 422 });

  if (await protectsSuperAdmin(parsed.data.userId)) {
    return NextResponse.json({ error: "SUPERADMIN_PROTECTED" }, { status: 409 });
  }

  try {
    const result = await setUserAccountStatus({ ...parsed.data, actorEmail: actor.email });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const actor = await guard();
  if (!actor) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 422 });

  if (await protectsSuperAdmin(parsed.data.userId)) {
    return NextResponse.json({ error: "SUPERADMIN_PROTECTED" }, { status: 409 });
  }

  try {
    const result = await deleteUser({ userId: parsed.data.userId, actorEmail: actor.email });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_OWNS_WORKSPACES") {
      return NextResponse.json({ error: "USER_OWNS_WORKSPACES" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(redactDatabaseError(error), { status: 500 });
  }
}
