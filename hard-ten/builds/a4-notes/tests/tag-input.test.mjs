import test from 'node:test';
import assert from 'node:assert/strict';
import { displayTags, editTags, parseTags } from '../lib/tag-input.mjs';

test('tag editing preserves trailing spaces and commas so Backspace works', () => {
  let rawText = null;
  let tags = [];
  const type = text => {
    const edit = editTags(text);
    rawText = edit.rawText;
    tags = edit.tags;
    return displayTags(rawText, tags);
  };

  assert.equal(type('a, b'), 'a, b');
  assert.deepEqual(tags, ['a', 'b']);
  assert.equal(type('a, '), 'a, ', 'deleting b must not restore the old separator');
  assert.equal(type('a,'), 'a,', 'the comma must remain deleted on the next render');
  assert.equal(type('a'), 'a');
  assert.deepEqual(tags, ['a']);
  assert.equal(type(''), '');
  assert.deepEqual(tags, []);
});

test('tag values normalize only when parsed for the note, not in the input', () => {
  const edit = editTags(' work, ideas, work, , ');
  assert.equal(edit.rawText, ' work, ideas, work, , ');
  assert.deepEqual(edit.tags, ['work', 'ideas']);
  assert.equal(displayTags(edit.rawText, edit.tags), edit.rawText);
  assert.equal(displayTags(null, edit.tags), 'work, ideas');
  assert.deepEqual(parseTags('one, two'), ['one', 'two']);
});
