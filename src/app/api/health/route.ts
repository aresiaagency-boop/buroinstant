import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { googleOAuthConfigured } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "buroinstant-web",
    timestamp: new Date().toISOString(),
    configuration: {
      database: isDatabaseConfigured() ? "configured" : "not_configured",
      googleOAuth: googleOAuthConfigured ? "configured" : "not_configured",
      n8nWebhook: process.env.N8N_WEBHOOK_SECRET ? "configured" : "not_configured",
      evolutionApi:
        process.env.EVOLUTION_API_BASE_URL && process.env.EVOLUTION_API_INSTANCE
          ? "configured"
          : "not_configured",
    },
  });
}
