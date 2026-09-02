import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.log("[migrate] DATABASE_URL not configured; skipping migrations.");
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(root, "db", "migrations");
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const sql = postgres(connectionString, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  prepare: false,
});

function transactionBody(source) {
  return source
    .replace(/^\s*begin\s*;\s*/i, "")
    .replace(/\s*commit\s*;\s*$/i, "")
    .trim();
}

try {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('buroinstant:migrations'))`;
    await tx`
      create table if not exists schema_migrations (
        id text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `;

    for (const file of migrationFiles) {
      const source = await readFile(join(migrationsDirectory, file), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const applied = await tx`
        select checksum from schema_migrations where id = ${file}
      `;

      if (applied.length > 0) {
        if (applied[0].checksum !== checksum) {
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${file}`);
        }
        console.log(`[migrate] already applied: ${file}`);
        continue;
      }

      await tx.unsafe(transactionBody(source));
      await tx`
        insert into schema_migrations (id, checksum)
        values (${file}, ${checksum})
      `;
      console.log(`[migrate] applied: ${file}`);
    }
  });
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "MIGRATION_FAILED";
  console.error(`[migrate] failed: ${code}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

