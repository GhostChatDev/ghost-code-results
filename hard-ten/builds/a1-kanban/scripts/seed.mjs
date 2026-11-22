import pg from 'pg';
import { demoBoard } from '../lib/demo.mjs';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query('INSERT INTO boards(id, state) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [demoBoard.id, JSON.stringify(demoBoard)]);
  console.log(result.rowCount ? 'Created demo board.' : 'Demo board already exists; existing work was preserved.');
} finally { await client.end(); }
