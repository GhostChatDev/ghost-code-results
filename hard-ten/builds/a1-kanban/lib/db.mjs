import pg from 'pg';
import { applyAction, OperationError } from './board.mjs';

let pool;
function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, allowExitOnIdle: true });
}
export async function getBoard(id) {
  const result = await database().query('SELECT state, revision FROM boards WHERE id = $1', [id]);
  if (!result.rowCount) return null;
  return { board: result.rows[0].state, revision: Number(result.rows[0].revision) };
}
export async function applyBoardOperation(id, operation) {
  if (!operation || typeof operation.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation.id)) throw new OperationError('Invalid operation id');
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT state, revision FROM boards WHERE id = $1 FOR UPDATE', [id]);
    if (!result.rowCount) throw new OperationError('Board not found');
    const seen = await client.query('SELECT 1 FROM board_operations WHERE board_id = $1 AND operation_id = $2', [id, operation.id]);
    let board = result.rows[0].state;
    let revision = Number(result.rows[0].revision);
    if (!seen.rowCount) {
      board = applyAction(board, operation.action);
      revision++;
      await client.query('UPDATE boards SET state = $2, revision = $3 WHERE id = $1', [id, JSON.stringify(board), revision]);
      await client.query('INSERT INTO board_operations(board_id, operation_id) VALUES ($1, $2)', [id, operation.id]);
    }
    await client.query('COMMIT');
    return { board, revision, duplicate: !!seen.rowCount };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
