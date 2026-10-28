import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const image = (sourceKey: string) => ({ sourceKey, name: `${sourceKey}.d88`, bytes: new Uint8Array([1, 2]).buffer, savedAt: 1 });

function open(version?: number, upgrade?: (db: IDBDatabase, tx: IDBTransaction) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('webnp2', version);
    req.onupgradeneeded = () => upgrade?.(req.result, req.transaction!);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}

async function v1(): Promise<IDBDatabase> {
  return open(1, (db, tx) => {
    db.createObjectStore('images', { keyPath: 'sourceKey' });
    tx.objectStore('images').put(image('old'));
  });
}

describe('ディスク保存 DB', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    globalThis.indexedDB = new IDBFactory();
  });

  it('新規 DB に両ストアを作成する', async () => {
    const db = await import('../src/storage/db');
    await db.listIndex();
    const connection = await open();
    expect([...connection.objectStoreNames]).toEqual(['images', 'index']);
    connection.close();
  });

  it('v1 のレコードを v2 の索引に移行する', async () => {
    (await v1()).close();
    const db = await import('../src/storage/db');
    expect(await db.listIndex()).toEqual([{ sourceKey: 'old', name: 'old.d88', savedAt: 1, size: 2 }]);
    const connection = await open();
    expect(connection.version).toBe(2);
    connection.close();
  });

  it('索引と本体のキーのずれを修復する', async () => {
    const db = await import('../src/storage/db');
    await db.put(image('missing'));
    const connection = await open();
    const tx = connection.transaction('index', 'readwrite');
    tx.objectStore('index').delete('missing');
    tx.objectStore('index').put({ sourceKey: 'orphan', name: 'orphan', savedAt: 1, size: 2 });
    await complete(tx);
    expect((await db.listIndex()).map((item) => item.sourceKey)).toEqual(['missing']);
    expect((await db.listIndex()).map((item) => item.sourceKey)).toEqual(['missing']);
    connection.close();
  });

  it('索引からメタ情報を保持し本体を読み出さない', async () => {
    const db = await import('../src/storage/db');
    await db.put({ ...image('disk'), displayName: '表示名', group: 'group', groupName: '組', groupIndex: 0 });
    const spy = vi.spyOn(IDBObjectStore.prototype, 'get');
    await db.putPreservingMeta({ ...image('disk'), displayName: '別名', group: 'other' });
    expect(spy.mock.contexts.map((store) => store.name)).toEqual(['index']);
    expect(await db.get('disk')).toMatchObject({ displayName: '表示名', group: 'group', groupName: '組', groupIndex: 0 });
  });

  it('版上げの blocked と解除を通知し、接続が閉じるまで待つ', async () => {
    const old = await v1();
    const db = await import('../src/storage/db');
    let notify!: () => void;
    const blocked = new Promise<void>((resolve) => { notify = resolve; });
    const handler = vi.fn((waiting: boolean) => { if (waiting) notify(); });
    db.onUpgradeBlocked(handler);
    const pending = db.listIndex();
    await blocked;
    expect(handler.mock.calls).toEqual([[true]]);
    old.close();
    expect(await pending).toHaveLength(1);
    expect(handler.mock.calls).toEqual([[true], [false]]);
  });

  it('versionchange で接続を閉じ、次の操作で開き直す', async () => {
    const db = await import('../src/storage/db');
    await db.put(image('disk'));
    const newer = await open(2);
    expect(newer.version).toBe(2);
    newer.close();
    expect(await db.get('disk')).toMatchObject({ sourceKey: 'disk' });
  });
});
