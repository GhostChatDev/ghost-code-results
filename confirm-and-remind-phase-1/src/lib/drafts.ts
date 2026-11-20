// Local draft recovery in IndexedDB. Typing is saved here first, so text survives a closed tab or a dropped network.
// Saving a note never waits on the network: the draft is cleared only after the server confirms.
const DB_NAME = "confirm-remind";
const STORE = "drafts";

export interface Draft { key: string; text: string; clientId: string; updatedAt: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDraft(key: string, text: string, clientId: string): Promise<void> {
  if (!text) return clearDraft(key);
  await run("readwrite", (s) => s.put({ key, text, clientId, updatedAt: Date.now() } satisfies Draft));
}
export async function loadDraft(key: string): Promise<Draft | null> {
  return ((await run("readonly", (s) => s.get(key))) as Draft | undefined) ?? null;
}
export async function clearDraft(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}
export async function listDrafts(): Promise<Draft[]> {
  return (await run("readonly", (s) => s.getAll())) as Draft[];
}
