/**
 * Persists the working design in IndexedDB. Unlike localStorage it has no ~5 MB cap,
 * so designs with uploaded photos still save.
 */

const DB_NAME = "ogee";
const DB_VERSION = 1;
const STORE = "designs";
const CURRENT = "current";
/** Where designs lived before IndexedDB; moved over once, then removed. */
const LEGACY_KEY = "ogee:design";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab upgrading the schema needs this connection out of the way.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error("Could not open IndexedDB"));
      req.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
    }).catch((err: unknown) => {
      // Let a later call try again (e.g. after the blocking tab closes).
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      }),
  );
}

const available = () => typeof indexedDB !== "undefined";

/** The saved design, untrusted: callers must sanitize it. */
export async function loadDesign(): Promise<unknown> {
  if (!available()) return null;
  const saved = await run("readonly", (s) => s.get(CURRENT));
  if (saved !== undefined) return saved;

  let legacy: unknown = null;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    legacy = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  if (legacy) {
    await saveDesign(legacy);
    window.localStorage.removeItem(LEGACY_KEY);
  }
  return legacy;
}

export async function saveDesign(design: unknown): Promise<void> {
  if (!available()) return;
  await run("readwrite", (s) => s.put(design, CURRENT));
}
