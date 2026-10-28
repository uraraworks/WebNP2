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

/** 本体を含まない一覧用レコード。 */
export type ImageIndex = Omit<StoredImage, 'bytes'> & { size: number };

const DB_NAME = 'webnp2';
const STORE_NAME = 'images';
const INDEX_NAME = 'index';
let dbPromise: Promise<IDBDatabase> | null = null;
let upgradeBlockedHandler: ((blocked: boolean) => void) | null = null;

/** 版上げの待機開始と解除を通知する。 */
export function onUpgradeBlocked(handler: (blocked: boolean) => void): void {
  upgradeBlockedHandler = handler;
}

function createStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'sourceKey' });
  }
  if (!db.objectStoreNames.contains(INDEX_NAME)) {
    db.createObjectStore(INDEX_NAME, { keyPath: 'sourceKey' });
  }
}

function toIndex(image: StoredImage): ImageIndex {
  const { bytes, ...meta } = image;
  return { ...meta, size: bytes.byteLength };
}

// 版を固定しない。ストアとフィールドは追加のみとし、未知のフィールドは無視する。
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const attach = (db: IDBDatabase) => {
      db.onversionchange = () => {
        db.close();
        if (dbPromise === opening) dbPromise = null;
      };
      return db;
    };
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      createStores(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error('failed to open IndexedDB'));
    req.onsuccess = () => {
      const db = attach(req.result);
      if (db.objectStoreNames.contains(STORE_NAME) && db.objectStoreNames.contains(INDEX_NAME)) {
        resolve(db);
        return;
      }
      const version = db.version + 1;
      db.close();
      const upgrade = indexedDB.open(DB_NAME, version);
      let blocked = false;
      upgrade.onupgradeneeded = () => {
        createStores(upgrade.result);
      };
      upgrade.onblocked = () => {
        blocked = true;
        upgradeBlockedHandler?.(true);
      };
      upgrade.onerror = () => {
        if (blocked) upgradeBlockedHandler?.(false);
        reject(upgrade.error ?? new Error('failed to upgrade IndexedDB'));
      };
      upgrade.onsuccess = () => {
        if (blocked) upgradeBlockedHandler?.(false);
        resolve(attach(upgrade.result));
      };
    };
  });
  dbPromise = opening;
  void opening.catch(() => { if (dbPromise === opening) dbPromise = null; });
  return opening;
}

function writeStores(db: IDBDatabase): string[] {
  return db.objectStoreNames.contains(INDEX_NAME) ? [STORE_NAME, INDEX_NAME] : [STORE_NAME];
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

function writeImage(tx: IDBTransaction, image: StoredImage): void {
  tx.objectStore(STORE_NAME).put(image);
  if (tx.objectStoreNames.contains(INDEX_NAME)) tx.objectStore(INDEX_NAME).put(toIndex(image));
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
  const tx = db.transaction(writeStores(db), 'readwrite');
  writeImage(tx, image);
  await done(tx);
}

/**
 * イメージ本体を書き戻す。表示名/グループ等のメタ情報は既存レコードのものを常に優先する。
 * put() は1レコード全置換のため、ゲスト側の書き込み保存や同じファイルの再取り込みで
 * ユーザーが付けた名前が消えるのを防ぐ用途で使う。索引があれば本体を読まずにメタ情報を取得する。
 */
export async function putPreservingMeta(image: StoredImage): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(writeStores(db), 'readwrite');
  const images = tx.objectStore(STORE_NAME);
  const save = (existing?: ImageMeta) => {
    const hasMeta = existing && (
      existing.displayName !== undefined ||
      existing.group !== undefined ||
      existing.groupName !== undefined ||
      existing.groupIndex !== undefined
    );
    writeImage(tx, hasMeta ? {
      ...image,
      displayName: existing.displayName,
      group: existing.group,
      groupName: existing.groupName,
      groupIndex: existing.groupIndex,
    } : image);
  };
  const readImage = () => {
    const req = images.get(image.sourceKey);
    req.onsuccess = () => save(req.result);
  };
  if (tx.objectStoreNames.contains(INDEX_NAME)) {
    const req = tx.objectStore(INDEX_NAME).get(image.sourceKey);
    req.onsuccess = () => {
      if (req.result) {
        save(req.result);
      } else {
        readImage();
      }
    };
  } else {
    readImage();
  }
  await done(tx);
}

/**
 * 既存レコードのメタ情報(表示名/グループ)だけを更新する。イメージ本体は変更しない。
 * インラインのメタ情報と索引を共に更新し、古い読み手との互換性を保つ。
 */
export async function updateMeta(sourceKey: string, meta: ImageMeta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(writeStores(db), 'readwrite');
  const req = tx.objectStore(STORE_NAME).get(sourceKey);
  req.onsuccess = () => {
    if (req.result) {
      writeImage(tx, { ...req.result, ...meta });
    }
  };
  await done(tx);
}

/** キーの差分だけを修復し、移行済みレコードの本体は読まない。 */
export async function listIndex(): Promise<ImageIndex[]> {
  const db = await openDb();
  if (!db.objectStoreNames.contains(INDEX_NAME)) return (await getAllStored()).map(toIndex);
  const tx = db.transaction([STORE_NAME, INDEX_NAME], 'readwrite');
  const images = tx.objectStore(STORE_NAME);
  const index = tx.objectStore(INDEX_NAME);
  const keysReq = images.getAllKeys();
  const indexReq = index.getAll();
  let result: ImageIndex[] = [];
  indexReq.onsuccess = () => {
    const records = indexReq.result as ImageIndex[];
    const keys = new Set(keysReq.result);
    const indexed = new Set(records.map((record) => record.sourceKey));
    result = records.filter((record) => {
      if (keys.has(record.sourceKey)) return true;
      index.delete(record.sourceKey);
      return false;
    });
    for (const key of keys) {
      if (indexed.has(key as string)) continue;
      const req = images.get(key);
      req.onsuccess = () => {
        if (req.result) {
          const record = toIndex(req.result);
          index.put(record);
          result.push(record);
        }
      };
    }
  };
  await done(tx);
  return result;
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
  const tx = db.transaction(writeStores(db), 'readwrite');
  tx.objectStore(STORE_NAME).delete(sourceKey);
  if (tx.objectStoreNames.contains(INDEX_NAME)) tx.objectStore(INDEX_NAME).delete(sourceKey);
  await done(tx);
}

// `delete` は予約語のため関数名としては `del` を使い、
// 呼び出し側からは `delete` という名前でも import できるようにエイリアスする。
export { del as delete };
