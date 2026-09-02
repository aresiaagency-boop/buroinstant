import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { assessBusinessFormation } from "@/lib/assessment";
import { assessmentInputSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  const parsed = assessmentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json({ assessment: assessBusinessFormation(parsed.data) });
}
