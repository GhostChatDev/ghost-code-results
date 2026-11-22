import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { demoBoard } from '../lib/demo.mjs';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)');
  const files = (await readdir(new URL('../migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(49231482)');
      const found = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (!found.rowCount) {
        await client.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        console.log(`Applied ${file}`);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  await client.query('INSERT INTO boards(id, state) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [demoBoard.id, JSON.stringify(demoBoard)]);
} finally { await client.end(); }
