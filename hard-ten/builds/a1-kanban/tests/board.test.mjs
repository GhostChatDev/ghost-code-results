import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createHistory, record, undo, redo } from '../lib/board.mjs';
import { demoBoard } from '../lib/demo.mjs';

const ids = (board, column) => board.columns.find(c => c.id === column).cards.map(c => c.id);

test('moves a card within a column in either direction without mutating the original', () => {
  const down = applyAction(demoBoard, { type: 'move', cardId: 'c1', columnId: 'ideas', index: 2 });
  assert.deepEqual(ids(down, 'ideas'), ['c2', 'c3', 'c1']);
  const up = applyAction(down, { type: 'move', cardId: 'c1', columnId: 'ideas', index: 0 });
  assert.deepEqual(ids(up, 'ideas'), ['c1', 'c2', 'c3']);
  assert.deepEqual(ids(demoBoard, 'ideas'), ['c1', 'c2', 'c3']);
});

test('moves a card between columns at the requested position', () => {
  const board = applyAction(demoBoard, { type: 'move', cardId: 'c2', columnId: 'progress', index: 1 });
  assert.deepEqual(ids(board, 'ideas'), ['c1', 'c3']);
  assert.deepEqual(ids(board, 'progress'), ['c4', 'c2', 'c5']);
});

test('undo and redo restore moves and edits and new edits clear redo', () => {
  const moved = record(createHistory(), demoBoard, { type: 'move', cardId: 'c1', columnId: 'progress', index: 1 });
  const card = { ...moved.board.columns[1].cards[1], title: 'Updated', checklist: [{ id: 'new', text: 'Review', done: false }] };
  const edited = record(moved.history, moved.board, { type: 'put', card, columnId: 'progress', index: 1 });
  const u1 = undo(edited.history, edited.board);
  assert.equal(u1.board.columns[1].cards[1].title, 'Explore customer feedback');
  const u2 = undo(u1.history, u1.board);
  assert.deepEqual(u2.board, demoBoard);
  const r1 = redo(u2.history, u2.board);
  const r2 = redo(r1.history, r1.board);
  assert.deepEqual(r2.board, edited.board);
  const undone = undo(r2.history, r2.board);
  const changed = record(undone.history, undone.board, { type: 'move', cardId: 'c3', columnId: 'done', index: 0 });
  assert.equal(redo(changed.history, changed.board), null);
});
