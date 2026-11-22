import { applyAction } from './board.mjs';

export function replay(board, operations) {
  return operations.reduce((state, operation) => applyAction(state, operation.action), board);
}

// One drain per queue instance; acknowledged operations are removed only after a successful response.
export function createQueue({ load, save, send, onChange }) {
  let draining = null;
  async function drain() {
    if (draining) return draining;
    draining = (async () => {
      while (load().queue.length) {
        const operation = load().queue[0];
        const response = await send(operation);
        const current = load();
        if (current.queue[0]?.id !== operation.id) throw new Error('Queue changed while syncing');
        const queue = current.queue.slice(1);
        const board = replay(response.board, queue);
        const next = { ...current, board, queue, revision: response.revision };
        save(next);
        onChange?.(next);
      }
    })();
    try { return await draining; } finally { draining = null; }
  }
  return { drain };
}
