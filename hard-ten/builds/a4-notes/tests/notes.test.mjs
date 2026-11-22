import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import '../scripts/migrate.mjs';
import { closeDb, db, deleteNote, getNote, history, listNotes, saveNote } from '../lib/notes.mjs';
import { GET } from '../app/api/[[...path]]/route.js';

beforeEach(async () => {
  await db().query('TRUNCATE notes CASCADE');
});

after(async () => {
  await closeDb();
});

test('PostgreSQL full-text search ranks title matches above body matches and highlights matching words', async () => {
  const bodyHitId = crypto.randomUUID();
  const titleHitId = crypto.randomUUID();
  const unrelatedId = crypto.randomUUID();

  await saveNote({
    id: bodyHitId,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    note: {
      title: 'General architecture notebook',
      body: 'We tuned the PostgreSQL indexing strategy for fast retrieval across journals.',
      tags: ['db'],
      pinned: true,
    },
  });

  await saveNote({
    id: titleHitId,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    note: {
      title: 'PostgreSQL indexing guide',
      body: ' PostgreSQL indexing keeps full-text search responsive even as notes grow.',
      tags: ['postgres', 'search'],
      pinned: false,
    },
  });

  await saveNote({
    id: unrelatedId,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    note: {
      title: 'Grocery checklist',
      body: 'Apples, oats, coffee beans, and olive oil.',
      tags: ['home'],
      pinned: false,
    },
  });

  const results = await listNotes('PostgreSQL indexing');
  assert.equal(results.length, 2);
  assert.equal(results[0].id, titleHitId, 'title weight A + body match should rank ahead of body-only match');
  assert.equal(results[1].id, bodyHitId);
  assert.ok(Number(results[0].rank) > Number(results[1].rank));
  assert.match(results[0].title_highlight, /⟦PostgreSQL⟧/);
  assert.match(results[0].title_highlight, /⟦indexing⟧/);
  assert.match(results[1].body_highlight, /⟦PostgreSQL⟧/);
});

test('version history records every save, restores an older version as a new revision, and deduplicates retried requestIds', async () => {
  const id = crypto.randomUUID();
  const req1 = crypto.randomUUID();

  const first = await saveNote({
    id,
    expectedRevision: 0,
    requestId: req1,
    note: { title: 'Draft v1', body: 'First body text', tags: ['alpha'], pinned: false },
  });
  assert.equal(first.note.revision, 1);

  // Retrying the exact same write with the same requestId is idempotent and leaves one version, not two
  const retry = await saveNote({
    id,
    expectedRevision: 0,
    requestId: req1,
    note: { title: 'Draft v1', body: 'First body text', tags: ['alpha'], pinned: false },
  });
  assert.equal(retry.replayed, true);
  assert.equal(retry.note.revision, 1);

  const second = await saveNote({
    id,
    expectedRevision: 1,
    requestId: crypto.randomUUID(),
    note: { title: 'Draft v2', body: 'Updated second body', tags: ['alpha', 'beta'], pinned: true },
  });
  assert.equal(second.note.revision, 2);

  const restored = await saveNote({
    id,
    expectedRevision: 2,
    requestId: crypto.randomUUID(),
    restoreRevision: 1,
  });
  assert.equal(restored.note.revision, 3);
  assert.equal(restored.note.title, 'Draft v1');
  assert.equal(restored.note.body, 'First body text');
  assert.deepEqual(restored.note.tags, ['alpha']);
  assert.equal(restored.note.pinned, false);

  const versions = await history(id);
  assert.deepEqual(versions.map(v => v.revision), [3, 2, 1]);
  assert.equal(versions[0].title, 'Draft v1');
  assert.equal(versions[1].title, 'Draft v2');
});

test('concurrent editing conflict is refused without overwriting and returns the latest saved version', async () => {
  const id = crypto.randomUUID();
  await saveNote({
    id,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    note: { title: 'Shared Note', body: 'Initial content', tags: ['team'], pinned: false },
  });

  // Tab A saves revision 2
  const tabA = await saveNote({
    id,
    expectedRevision: 1,
    requestId: crypto.randomUUID(),
    note: { title: 'Shared Note (Tab A)', body: 'Tab A saved first', tags: ['team'], pinned: true },
  });
  assert.equal(tabA.note.revision, 2);

  // Tab B still has revision 1 and attempts to save over revision 2
  const tabB = await saveNote({
    id,
    expectedRevision: 1,
    requestId: crypto.randomUUID(),
    note: { title: 'Shared Note (Tab B)', body: 'Tab B stale overwrite attempt', tags: ['team'], pinned: false },
  });
  assert.equal(tabB.conflict, true);
  assert.equal(tabB.current.revision, 2);
  assert.equal(tabB.current.title, 'Shared Note (Tab A)');
  assert.equal(tabB.current.body, 'Tab A saved first');

  const stored = await getNote(id);
  assert.equal(stored.revision, 2);
  assert.equal(stored.body, 'Tab A saved first');
});

test('single note Markdown export and all-notes zip export return expected files', async () => {
  const id = crypto.randomUUID();
  await saveNote({
    id,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    note: { title: 'Exportable Note', body: '# Hello Quillstack\n\nExported body.', tags: ['export'], pinned: false },
  });

  const mdRes = await GET(new Request(`http://localhost/api/${id}/export`), {
    params: Promise.resolve({ path: [id, 'export'] }),
  });
  assert.equal(mdRes.status, 200);
  assert.match(mdRes.headers.get('content-disposition'), /Exportable-Note-.*\.md/);
  assert.equal(await mdRes.text(), '# Hello Quillstack\n\nExported body.');

  const zipRes = await GET(new Request('http://localhost/api/export'), {
    params: Promise.resolve({ path: ['export'] }),
  });
  assert.equal(zipRes.status, 200);
  assert.equal(zipRes.headers.get('content-type'), 'application/zip');
  const buf = Buffer.from(await zipRes.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString('utf8'), 'PK');
});
