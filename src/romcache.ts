// Optionaler ROM-Cache im Browser (IndexedDB). Es wird nur gespeichert, wenn der Nutzer ausdrücklich "Ja" sagt.
const DB = "romify-cache";
const STORE = "roms";

export interface Cached {
  id: string;
  blob: Blob;
  size: number;
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const getCached = (id: string) => run<Cached | undefined>("readonly", (s) => s.get(id)).catch(() => undefined);

export async function putCached(id: string, blob: Blob): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.put({ id, blob, size: blob.size, savedAt: Date.now() } satisfies Cached));
    void navigator.storage?.persist?.(); // Browser soll den Cache möglichst nicht automatisch löschen
    return true;
  } catch {
    return false; // z. B. Speicher voll oder privater Modus
  }
}

export const removeCached = (id: string) => run("readwrite", (s) => s.delete(id)).catch(() => undefined);
export const clearCache = () => run("readwrite", (s) => s.clear()).catch(() => undefined);

/** Größen aller gecachten ROMs (id -> Bytes). */
export async function cacheSizes(): Promise<Map<string, number>> {
  try {
    const all = await run<Cached[]>("readonly", (s) => s.getAll());
    return new Map(all.map((c) => [c.id, c.size]));
  } catch {
    return new Map();
  }
}

// Entscheidung pro ROM: "yes" = cachen, "no" = nicht cachen, null = noch nicht gefragt.
const prefKey = (id: string) => `romify.cache.${id}`;
export function getPref(id: string): "yes" | "no" | null {
  try {
    const v = localStorage.getItem(prefKey(id));
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}
export function setPref(id: string, v: "yes" | "no" | null) {
  try {
    if (v) localStorage.setItem(prefKey(id), v);
    else localStorage.removeItem(prefKey(id));
  } catch {
    /* ohne Speicher wird beim nächsten Start erneut gefragt */
  }
}
