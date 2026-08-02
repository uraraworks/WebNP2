// IndexedDB ラッパ (外部ライブラリ不使用、Promiseベース)。
// ディスクイメージの永続化に使う。

export interface StoredImage {
  sourceKey: string;
  url?: string;
  /** 元のファイル名(拡張子含む)。イメージ種別の判定とエクスポート時のファイル名に使う。リネームしても変わらない。 */
  name: string;
  bytes: ArrayBuffer;
  savedAt: number;
  /** ライブラリ一覧での表示名。未設定なら name をそのまま表示する。 */
  displayName?: string;
  /** 同一アーカイブから展開した複数ディスクをまとめるグループID。単体イメージでは未設定。 */
  group?: string;
  /** グループの表示名。同一グループの全レコードが同じ値を持つ(リネーム時は全件更新)。 */
  groupName?: string;
  /** グループ内の並び順(アーカイブ内の出現順)。 */
  groupIndex?: number;
}

/** 表示名/グループ情報など、UI側で付けたメタ情報のみを抜き出した型。 */
export type ImageMeta = Pick<StoredImage, 'displayName' | 'group' | 'groupName' | 'groupIndex'>;

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

/**
 * イメージ本体を書き戻す。表示名/グループ等のメタ情報は既存レコードのものを常に優先する。
 * put() は1レコード全置換のため、ゲスト側の書き込み保存や同じファイルの再取り込みで
 * ユーザーが付けた名前が消えるのを防ぐ用途で使う。
 */
export async function putPreservingMeta(image: StoredImage): Promise<void> {
  const existing = await get(image.sourceKey);
  if (!existing) {
    await put(image);
    return;
  }
  const hasMeta =
    existing.displayName !== undefined ||
    existing.group !== undefined ||
    existing.groupName !== undefined ||
    existing.groupIndex !== undefined;
  await put({
    ...image,
    displayName: hasMeta ? existing.displayName : image.displayName,
    group: hasMeta ? existing.group : image.group,
    groupName: hasMeta ? existing.groupName : image.groupName,
    groupIndex: hasMeta ? existing.groupIndex : image.groupIndex,
  });
}

/** 既存レコードのメタ情報(表示名/グループ)だけを更新する。イメージ本体は書き換えない。 */
export async function updateMeta(sourceKey: string, meta: ImageMeta): Promise<void> {
  const existing = await get(sourceKey);
  if (!existing) return;
  await put({ ...existing, ...meta });
}

/** sourceKey が prefix で始まる全レコードを取得する。 */
export async function getAllByPrefix(prefix: string): Promise<StoredImage[]> {
  const db = await openDb();
  return new Promise<StoredImage[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const range = IDBKeyRange.bound(prefix, prefix + '￿');
    const req = store.getAll(range);
    req.onsuccess = () => resolve((req.result as StoredImage[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('failed to read from IndexedDB'));
  });
}

/** store内の全レコードを取得する。 */
export async function getAllStored(): Promise<StoredImage[]> {
  const db = await openDb();
  return new Promise<StoredImage[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as StoredImage[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('failed to read from IndexedDB'));
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
