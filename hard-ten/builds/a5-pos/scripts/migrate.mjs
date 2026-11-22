import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations");
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const files = (await readdir("migrations")).filter((file) => file.endsWith(".sql")).sort();
  const installed = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ready");
  const applied = installed.rows[0].ready
    ? new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((row) => row.name))
    : new Set();
  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`Applying ${file}`);
    await client.query(await readFile(path.join("migrations", file), "utf8"));
  }
  console.log("Database migrations are up to date.");
} finally {
  await client.end();
}
