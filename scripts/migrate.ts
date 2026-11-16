/**
 * Apply SQL migrations in db/migrations/ idempotently.
 * Usage: npm run db:migrate  (requires DATABASE_URL)
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const dir = path.join(process.cwd(), 'db', 'migrations');

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS kc_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const [{ count }] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM kc_schema_migrations WHERE id = ${file}
    `;
    if (Number(count) > 0) {
      console.log(`skip ${file}`);
      continue;
    }
    const body = await readFile(path.join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO kc_schema_migrations (id) VALUES (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log('Migrations complete.');
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end({ timeout: 1 });
  process.exit(1);
});
