import { NextResponse } from "next/server";
import { db, isDatabaseConfigured } from "@/lib/db";
import { googleOAuthConfigured } from "@/lib/auth";

export async function GET() {
  let database: "not_configured" | "connected" | "unreachable" = "not_configured";
  let appliedMigrations = 0;

  if (isDatabaseConfigured()) {
    try {
      const sql = db();
      await sql`select 1 as ok`;
      const result = await sql`
        select count(*)::int as count from schema_migrations
      `;
      database = "connected";
      appliedMigrations = Number(result[0]?.count ?? 0);
    } catch {
      database = "unreachable";
    }
  }

  const healthy = database !== "unreachable";
  return NextResponse.json({
    status: healthy ? "ok" : "degraded",
    service: "buroinstant-web",
    timestamp: new Date().toISOString(),
    configuration: {
      database,
      appliedMigrations,
      googleOAuth: googleOAuthConfigured ? "configured" : "not_configured",
      n8nWebhook: process.env.N8N_WEBHOOK_SECRET ? "configured" : "not_configured",
      evolutionApi:
        process.env.EVOLUTION_API_BASE_URL && process.env.EVOLUTION_API_INSTANCE
          ? "configured"
          : "not_configured",
    },
  }, { status: healthy ? 200 : 503 });
}
