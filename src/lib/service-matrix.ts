import { connect } from "node:net";
import { db, isDatabaseConfigured } from "@/lib/db";
import { googleOAuthConfigured } from "@/lib/auth";

/**
 * Matriz de servicios del panel de administración.
 *
 * Comprueba de verdad lo que se puede comprobar sin efectos secundarios ni
 * coste: la base de datos responde, el puerto de Redis acepta conexión, n8n y
 * Evolution contestan por HTTP. Para las claves de proveedores de IA se informa
 * de si están configuradas: gastar una llamada sólo para pintar un semáforo
 * sería malgastar cuota del usuario.
 */

export type ServiceStatus = "OK" | "DEGRADED" | "NOT_CONFIGURED" | "ERROR";

export type ServiceCheck = {
  key: string;
  name: string;
  purpose: string;
  status: ServiceStatus;
  detail: string;
  latencyMs: number | null;
  checkedAt: string;
};

const TIMEOUT_MS = 4_000;

function elapsed(start: number) {
  return Math.round(performance.now() - start);
}

async function checkDatabase(): Promise<ServiceCheck> {
  const base = {
    key: "postgres",
    name: "PostgreSQL",
    purpose: "Fuente de verdad del expediente",
    checkedAt: new Date().toISOString(),
  };
  if (!isDatabaseConfigured()) {
    return { ...base, status: "NOT_CONFIGURED", detail: "DATABASE_URL sin definir", latencyMs: null };
  }
  const start = performance.now();
  try {
    const rows = await db()<Array<{ tables: string }>>`
      select count(*)::text as tables
      from information_schema.tables
      where table_schema = 'public'
    `;
    return {
      ...base,
      status: "OK",
      detail: `${rows[0]?.tables ?? "0"} tablas en el esquema público`,
      latencyMs: elapsed(start),
    };
  } catch {
    return { ...base, status: "ERROR", detail: "La conexión no respondió", latencyMs: elapsed(start) };
  }
}

function checkTcp(rawUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      resolve(false);
      return;
    }
    const port = Number(url.port) || (url.protocol === "rediss:" ? 6380 : 6379);
    const socket = connect({ host: url.hostname, port, timeout: TIMEOUT_MS });
    const finish = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function checkRedis(): Promise<ServiceCheck> {
  const base = {
    key: "redis",
    name: "Redis",
    purpose: "Buffers, límites de peticiones e idempotencia",
    checkedAt: new Date().toISOString(),
  };
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return { ...base, status: "NOT_CONFIGURED", detail: "REDIS_URL sin definir", latencyMs: null };
  }
  const start = performance.now();
  const reachable = await checkTcp(url);
  return {
    ...base,
    status: reachable ? "OK" : "ERROR",
    detail: reachable ? "Puerto accesible" : "El puerto no acepta conexión",
    latencyMs: elapsed(start),
  };
}

async function checkHttp(
  key: string,
  name: string,
  purpose: string,
  rawUrl: string | undefined,
  missing: string,
): Promise<ServiceCheck> {
  const base = { key, name, purpose, checkedAt: new Date().toISOString() };
  const url = rawUrl?.trim();
  if (!url) return { ...base, status: "NOT_CONFIGURED", detail: missing, latencyMs: null };

  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Un 401 o un 403 significan que el servicio está vivo y protegido: eso es
    // exactamente lo que se espera de un panel con autenticación.
    const alive = response.status < 500;
    return {
      ...base,
      status: alive ? "OK" : "DEGRADED",
      detail: `HTTP ${response.status}`,
      latencyMs: elapsed(start),
    };
  } catch {
    return { ...base, status: "ERROR", detail: "Sin respuesta", latencyMs: elapsed(start) };
  }
}

function checkConfigured(
  key: string,
  name: string,
  purpose: string,
  configured: boolean,
  detailOk: string,
  detailMissing: string,
): ServiceCheck {
  return {
    key,
    name,
    purpose,
    status: configured ? "OK" : "NOT_CONFIGURED",
    detail: configured ? detailOk : detailMissing,
    latencyMs: null,
    checkedAt: new Date().toISOString(),
  };
}

export async function readServiceMatrix(): Promise<ServiceCheck[]> {
  const [database, redis, n8n, evolution] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkHttp(
      "n8n",
      "n8n",
      "Orquestador de automatizaciones",
      process.env.N8N_BASE_URL,
      "N8N_BASE_URL sin definir",
    ),
    checkHttp(
      "evolution",
      "Evolution API",
      "Canal de WhatsApp",
      process.env.EVOLUTION_MANAGER_URL ?? process.env.EVOLUTION_API_BASE_URL,
      "EVOLUTION_API_BASE_URL sin definir",
    ),
  ]);

  return [
    database,
    redis,
    n8n,
    evolution,
    checkConfigured(
      "oauth",
      "Google OAuth",
      "Identidad de las personas usuarias",
      googleOAuthConfigured,
      "Cliente y secreto presentes",
      "Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o AUTH_SECRET",
    ),
    checkConfigured(
      "llm",
      "Proveedor de IA",
      "Razonamiento del agente y transcripción",
      Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY),
      "Al menos una clave configurada",
      "Sin clave: el núcleo determinista sigue funcionando",
    ),
    checkConfigured(
      "webhook",
      "Firma n8n → BUROINSTANT",
      "Autenticidad de la ingesta de WhatsApp",
      Boolean(process.env.N8N_WEBHOOK_SECRET),
      "Secreto compartido presente",
      "N8N_WEBHOOK_SECRET sin definir: la ingesta rechaza todo",
    ),
    checkConfigured(
      "encryption",
      "Cifrado en reposo",
      "Documentos y datos identificativos",
      Boolean(process.env.ENCRYPTION_KEY),
      "Clave presente",
      "ENCRYPTION_KEY sin definir",
    ),
  ];
}
