import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { demoBoard } from '../lib/demo.mjs';
import { applyBoardOperation, getBoard } from '../lib/db.mjs';

test('Postgres persists a card and deduplicates the same operation', { skip: !process.env.DATABASE_URL && 'DATABASE_URL is not set' }, async () => {
  // Make this integration test independently runnable against an empty database.
  execFileSync(process.execPath, ['scripts/migrate.mjs'], { stdio: 'inherit', env: process.env });
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const id = `test-${randomUUID()}`;
  const card = { id: randomUUID(), title: 'Integration test card', description: '', dueDate: '', labels: [], checklist: [] };
  const operation = { id: randomUUID(), action: { type: 'put', card, columnId: 'ideas', index: 0 } };
  try {
    await client.query('INSERT INTO boards(id, state) VALUES ($1, $2)', [id, JSON.stringify({ ...demoBoard, id })]);
    const first = await applyBoardOperation(id, operation);
    const second = await applyBoardOperation(id, operation);
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.revision, first.revision);
    const stored = await getBoard(id);
    assert.equal(stored.board.columns[0].cards.filter(c => c.id === card.id).length, 1);
    assert.deepEqual(stored.board.columns[0].cards[0], card);
  } finally {
    await client.query('DELETE FROM boards WHERE id = $1', [id]);
    await client.end();
  }
});
