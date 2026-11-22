import pg from 'pg';

const { Pool } = pg;
let pool;
export function db() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}
export async function closeDb() { if (pool) { await pool.end(); pool = undefined; } }

function validate(input) {
  if (!input || typeof input.title !== 'string' || typeof input.body !== 'string' ||
      !Array.isArray(input.tags) || input.tags.some(t => typeof t !== 'string') ||
      typeof input.pinned !== 'boolean') throw new Error('Invalid note data');
  if (input.title.length > 500 || input.body.length > 1000000 || input.tags.length > 50 || input.tags.some(t => t.length > 100)) throw new Error('Note is too large');
  return { title: input.title, body: input.body, tags: [...new Set(input.tags.map(t => t.trim()).filter(Boolean))], pinned: input.pinned };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id) { if (typeof id !== 'string' || !uuid.test(id)) throw new Error('Invalid ID'); }

export async function listNotes(query = '') {
  if (typeof query !== 'string' || query.length > 500) throw new Error('Invalid search');
  if (!query.trim()) return (await db().query('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC, id')).rows;
  const result = await db().query(`WITH q AS (SELECT websearch_to_tsquery('english', $1) AS query)
    SELECT n.*, ts_rank_cd(n.search_vector, q.query) AS rank,
      ts_headline('english', n.title, q.query, 'StartSel=⟦, StopSel=⟧, MaxFragments=0') AS title_highlight,
      ts_headline('english', n.body, q.query, 'StartSel=⟦, StopSel=⟧, MaxWords=35, MinWords=15, MaxFragments=2') AS body_highlight
    FROM notes n CROSS JOIN q WHERE n.search_vector @@ q.query
    ORDER BY rank DESC, n.updated_at DESC, n.id`, [query]);
  return result.rows;
}
export async function getNote(id) { validId(id); return (await db().query('SELECT * FROM notes WHERE id=$1', [id])).rows[0] || null; }
export async function history(id) {
  validId(id);
  return (await db().query('SELECT note_id, revision, title, body, tags, pinned, created_at FROM note_versions WHERE note_id=$1 ORDER BY revision DESC', [id])).rows;
}

// Locking the note serializes saves, and a request ID makes retried writes idempotent.
export async function saveNote({ id, expectedRevision, requestId, note, restoreRevision }) {
  validId(id); validId(requestId);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid revision');
  if (restoreRevision !== undefined && (!Number.isInteger(restoreRevision) || restoreRevision < 1)) throw new Error('Invalid restore revision');
  const data = restoreRevision === undefined ? validate(note) : null;
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    // A transaction advisory lock also protects concurrent creation of the same ID.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id]);
    const prior = await client.query('SELECT revision FROM note_versions WHERE note_id=$1 AND request_id=$2', [id, requestId]);
    if (prior.rowCount) {
      const current = (await client.query('SELECT * FROM notes WHERE id=$1', [id])).rows[0];
      await client.query('COMMIT');
      return { note: current, replayed: true, savedRevision: prior.rows[0].revision };
    }
    const current = (await client.query('SELECT * FROM notes WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if ((current?.revision ?? 0) !== expectedRevision) {
      await client.query('ROLLBACK');
      return { conflict: true, current: current || null };
    }
    let next = data;
    if (restoreRevision !== undefined) {
      const version = (await client.query('SELECT title, body, tags, pinned FROM note_versions WHERE note_id=$1 AND revision=$2', [id, restoreRevision])).rows[0];
      if (!version) { await client.query('ROLLBACK'); return { notFound: true }; }
      next = validate(version);
    }
    const revision = expectedRevision + 1;
    const result = await client.query(`INSERT INTO notes (id,title,body,tags,pinned,revision)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, body=EXCLUDED.body, tags=EXCLUDED.tags,
        pinned=EXCLUDED.pinned, revision=EXCLUDED.revision, updated_at=now() RETURNING *`,
      [id, next.title, next.body, next.tags, next.pinned, revision]);
    await client.query('INSERT INTO note_versions (note_id,revision,title,body,tags,pinned,request_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, revision, next.title, next.body, next.tags, next.pinned, requestId]);
    await client.query('COMMIT');
    return { note: result.rows[0] };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function deleteNote(id, expectedRevision) {
  validId(id);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('Invalid revision');
  const result = await db().query('DELETE FROM notes WHERE id=$1 AND revision=$2 RETURNING id', [id, expectedRevision]);
  if (result.rowCount) return { deleted: true };
  return { conflict: true, current: await getNote(id) };
}
