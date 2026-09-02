import postgres, { type Sql } from "postgres";

let client: Sql | null = null;

export type DatabaseJsonValue =
  | null
  | string
  | number
  | boolean
  | readonly DatabaseJsonValue[]
  | { readonly [key: string | number]: DatabaseJsonValue | undefined };

export function toDatabaseJson(value: unknown): DatabaseJsonValue {
  return JSON.parse(JSON.stringify(value)) as DatabaseJsonValue;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function db() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_NOT_CONFIGURED");
  }
  if (!client) {
    client = postgres(connectionString, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      transform: { undefined: null },
    });
  }
  return client;
}

export function redactDatabaseError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: unknown }).code)
      : "DATABASE_ERROR";
  return { code, message: "La operación de datos no pudo completarse." };
}
