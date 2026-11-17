// Lokale ROM-Bibliothek in IndexedDB. ROM-Dateien verlassen nie das Gerät.
export interface LocalGame {
  key: string; // SHA-1 der Datei
  title: string;
  core: string;
  systemLabel: string;
  filename: string;
  file: Blob;
  addedAt: number;
}

const DB = "romify";
const STORE = "roms";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const listLocal = () => tx<LocalGame[]>("readonly", (s) => s.getAll());
export const getLocal = (key: string) => tx<LocalGame | undefined>("readonly", (s) => s.get(key));
export const putLocal = (g: LocalGame) => tx("readwrite", (s) => s.put(g));
export const removeLocal = (key: string) => tx("readwrite", (s) => s.delete(key));

export async function sha1(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
