import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../lib/queue.mjs';
import { applyAction } from '../lib/board.mjs';
import { demoBoard } from '../lib/demo.mjs';

const op = (id, cardId, columnId, index) => ({ id, action: { type: 'move', cardId, columnId, index } });

test('concurrent drains send queued changes once and in order', async () => {
  const a = op('a', 'c1', 'progress', 0), b = op('b', 'c2', 'done', 0);
  let local = { board: applyAction(applyAction(demoBoard, a.action), b.action), queue: [a, b] };
  let remote = demoBoard;
  const sent = [];
  const queue = createQueue({ load: () => local, save: value => { local = value; }, send: async operation => {
    sent.push(operation.id);
    await new Promise(resolve => setImmediate(resolve));
    remote = applyAction(remote, operation.action);
    return { board: remote, revision: sent.length };
  } });
  await Promise.all([queue.drain(), queue.drain(), queue.drain()]);
  assert.deepEqual(sent, ['a', 'b']);
  assert.deepEqual(local.queue, []);
  assert.deepEqual(local.board, remote);
});

test('failed requests stay queued and retry with the same id', async () => {
  const operation = op('a', 'c1', 'done', 0);
  let local = { board: applyAction(demoBoard, operation.action), queue: [operation] };
  let remote = demoBoard, calls = 0;
  const seen = new Set();
  const queue = createQueue({ load: () => local, save: value => { local = value; }, send: async change => {
    calls++;
    if (!seen.has(change.id)) { remote = applyAction(remote, change.action); seen.add(change.id); }
    if (calls === 1) throw new Error('response lost');
    return { board: remote, revision: seen.size };
  } });
  await assert.rejects(queue.drain(), /response lost/);
  assert.equal(local.queue[0].id, 'a');
  await queue.drain();
  assert.equal(calls, 2);
  assert.equal(seen.size, 1);
  assert.deepEqual(local.queue, []);
  assert.deepEqual(local.board, remote);
});
