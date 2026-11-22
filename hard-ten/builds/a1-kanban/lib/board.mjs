export class OperationError extends Error { constructor(message) { super(message); this.name = 'OperationError'; } }
const fail = message => { throw new OperationError(message); };
const str = (value, max = 200) => typeof value === 'string' && value.length <= max;
const idOk = value => str(value, 100) && value.length > 0;

export function validateCard(card) {
  if (!card || !idOk(card.id) || !str(card.title, 200) || !card.title.trim() || !str(card.description, 10000) || !str(card.dueDate, 10) || (card.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(card.dueDate)) || !Array.isArray(card.labels) || card.labels.length > 20 || card.labels.some(x => !str(x, 50)) || !Array.isArray(card.checklist) || card.checklist.length > 100 || card.checklist.some(x => !x || !idOk(x.id) || !str(x.text, 200) || !x.text.trim() || typeof x.done !== 'boolean')) fail('Invalid card');
}

export function applyAction(board, action) {
  if (!board || !Array.isArray(board.columns) || !action || typeof action !== 'object') fail('Invalid action');
  const next = structuredClone(board);
  const find = id => {
    for (const column of next.columns) {
      const index = column.cards.findIndex(card => card.id === id);
      if (index !== -1) return { column, index, card: column.cards[index] };
    }
    return null;
  };
  if (action.type === 'move') {
    if (!idOk(action.cardId) || !idOk(action.columnId) || !Number.isInteger(action.index) || action.index < 0) fail('Invalid move');
    const source = find(action.cardId);
    const target = next.columns.find(c => c.id === action.columnId);
    if (!source || !target) fail('Card or column no longer exists');
    source.column.cards.splice(source.index, 1);
    target.cards.splice(Math.min(action.index, target.cards.length), 0, source.card);
  } else if (action.type === 'put') {
    validateCard(action.card);
    if (!idOk(action.columnId) || !Number.isInteger(action.index) || action.index < 0) fail('Invalid card position');
    const target = next.columns.find(c => c.id === action.columnId);
    if (!target) fail('Column no longer exists');
    const current = find(action.card.id);
    if (current) current.column.cards.splice(current.index, 1);
    target.cards.splice(Math.min(action.index, target.cards.length), 0, structuredClone(action.card));
  } else if (action.type === 'delete') {
    if (!idOk(action.cardId)) fail('Invalid card id');
    const current = find(action.cardId);
    if (current) current.column.cards.splice(current.index, 1);
  } else fail('Unknown action');
  return next;
}

export function inverseAction(board, action) {
  for (const column of board.columns) {
    const index = column.cards.findIndex(c => c.id === (action.cardId ?? action.card?.id));
    if (index !== -1) {
      if (action.type === 'move') return { type: 'move', cardId: action.cardId, columnId: column.id, index };
      return { type: 'put', card: structuredClone(column.cards[index]), columnId: column.id, index };
    }
  }
  if (action.type === 'put') return { type: 'delete', cardId: action.card.id };
  fail('Cannot undo action');
}

export function createHistory() { return { undo: [], redo: [] }; }
export function record(history, board, action) {
  const inverse = inverseAction(board, action);
  return { board: applyAction(board, action), history: { undo: [...history.undo, { action, inverse }], redo: [] } };
}
export function undo(history, board) {
  if (!history.undo.length) return null;
  const item = history.undo.at(-1);
  return { board: applyAction(board, item.inverse), action: item.inverse, history: { undo: history.undo.slice(0, -1), redo: [...history.redo, item] } };
}
export function redo(history, board) {
  if (!history.redo.length) return null;
  const item = history.redo.at(-1);
  return { board: applyAction(board, item.action), action: item.action, history: { undo: [...history.undo, item], redo: history.redo.slice(0, -1) } };
}
