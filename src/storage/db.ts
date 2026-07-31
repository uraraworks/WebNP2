// IndexedDB ラッパ (外部ライブラリ不使用、Promiseベース)。
// ディスクイメージの永続化に使う。

export interface StoredImage {
  sourceKey: string;
  url?: string;
  name: string;
  bytes: ArrayBuffer;
  savedAt: number;
}

const DB_NAME = 'webnp2';
const DB_VERSION = 1;
const STORE_NAME = 'images';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sourceKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('failed to open IndexedDB'));
  });
  return dbPromise;
}

export async function get(sourceKey: string): Promise<StoredImage | undefined> {
  const db = await openDb();
  return new Promise<StoredImage | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(sourceKey);
    req.onsuccess = () => resolve((req.result as StoredImage | undefined) ?? undefined);
    req.onerror = () => reject(req.error ?? new Error('failed to read from IndexedDB'));
  });
}

export async function put(image: StoredImage): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(image);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('failed to write to IndexedDB'));
  });
}

export async function del(sourceKey: string): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(sourceKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('failed to delete from IndexedDB'));
  });
}

// `delete` は予約語のため関数名としては `del` を使い、
// 呼び出し側からは `delete` という名前でも import できるようにエイリアスする。
export { del as delete };
