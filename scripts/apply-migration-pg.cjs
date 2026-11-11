// Dev-only fallback for networks where Prisma's schema engine cannot resolve the Neon host
// (see scripts/public-dns.cjs). Applies pending migrations over node-postgres and records them in
// _prisma_migrations exactly as `prisma migrate deploy` does (checksum = sha256 of migration.sql).
// Usage: NODE_OPTIONS="-r ./scripts/public-dns.cjs" node scripts/apply-migration-pg.cjs
require("dotenv/config");
const { Client } = require("pg");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  await client.connect();
  const applied = new Set((await client.query("select migration_name from _prisma_migrations where finished_at is not null")).rows.map((r) => r.migration_name));
  const dir = path.join(__dirname, "..", "prisma", "migrations");
  for (const name of fs.readdirSync(dir).filter((n) => /^\d{14}_/.test(n)).sort()) {
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name, "migration.sql"));
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const id = crypto.randomUUID();
    await client.query("insert into _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) values ($1, $2, $3, now(), 0)", [id, checksum, name]);
    await client.query(sql.toString("utf8"));
    await client.query("update _prisma_migrations set finished_at = now(), applied_steps_count = 1 where id = $1", [id]);
    console.log("applied", name);
  }
  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
