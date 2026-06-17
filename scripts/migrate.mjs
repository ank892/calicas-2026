// CALICAS 2026 — script de migración para Supabase ED26.
//
// Uso:
//   $env:DATABASE_URL="postgresql://postgres.oxhkgtcqbsgjzagpziee:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
//   node scripts/migrate.mjs
//
// Alternativa: pegá `supabase/schema.sql` en el SQL editor del proyecto en supabase.com.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "..", "supabase", "schema.sql");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: definí DATABASE_URL");
    console.error('Ejemplo: postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres');
    process.exit(1);
  }
  const sql = readFileSync(SCHEMA_PATH, "utf8");
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("✓ Conectado al proyecto Supabase");
    await client.query(sql);
    console.log("✓ Tablas creadas: ed26_calicas_users / matches / predictions / phase_winners");
    console.log("✓ Vista ed26_calicas_leaderboard creada");
    console.log("✓ Realtime y RLS aplicados");
  } catch (err) {
    console.error("Error de migración:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
