// API層: CommandBus + WebNP2 クラス。
// UI はこの層を経由してのみコアを操作する（制御プレーン方針。docs/DESIGN.md 参照）。

import {
  boot as bootCore,
  readDiskFile,
  coreReset,
  coreSetFdd,
  coreStatSave,
  coreStatLoad,
  type BootConfig,
  type DiskFile,
  type EmscriptenFS,
} from '../core/module.ts';
import * as db from '../storage/db.ts';

const STATE_PATH = '/state0.sav';
const BLANK_FD_BYTES = 1_261_568; // 1.25MB 2HD ベタイメージ

export type DiskSlot = 'hdd' | 'fd1' | 'fd2';

/** マウント中の1イメージの由来情報。 */
export interface MountedImage {
  slot: DiskSlot;
  name: string;
  sourceKey: string;
  url?: string;
}

export type WebNP2EventMap = {
  booted: { fs: EmscriptenFS };
  bootError: { error: Error };
  persisted: { slot: DiskSlot; name: string };
  log: { level: 'info' | 'error'; message: string };
  fdChanged: { drive: 1 | 2; name?: string };
  stateSaved: Record<string, never>;
  stateLoaded: Record<string, never>;
};

type Listener<T> = (detail: T) => void;

class TypedEmitter<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<Listener<unknown>>>();

  on<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<unknown>);
    return () => set?.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof EventMap>(type: K, detail: EventMap[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of set) {
      (listener as Listener<EventMap[K]>)(detail);
    }
  }
}

const PERSIST_INTERVAL_MS = 30_000;
const COMPARE_CHUNK_BYTES = 4096;

interface MountedEntry extends MountedImage {
  lastSavedSnapshot?: { length: number; head: Uint8Array; tail: Uint8Array };
}

/**
 * WebNP2 コマンドバス。boot / persistNow / exportDisk / resetToOriginal / fullscreen を提供する。
 */
export class WebNP2 extends TypedEmitter<WebNP2EventMap> {
  private canvas: HTMLCanvasElement;
  private fs: EmscriptenFS | null = null;
  private mounted = new Map<DiskSlot, MountedEntry>();
  private persistTimer: ReturnType<typeof setInterval> | null = null;
  private boundOnVisibilityChange = (): void => this.onVisibilityChange();
  private boundOnPageHide = (): void => void this.persistNow();

  constructor(canvas: HTMLCanvasElement) {
    super();
    this.canvas = canvas;
  }

  isBooted(): boolean {
    return this.fs !== null;
  }

  getMountedImages(): MountedImage[] {
    return Array.from(this.mounted.values()).map(({ slot, name, sourceKey, url }) => ({
      slot,
      name,
      sourceKey,
      url,
    }));
  }

  /**
   * コアを起動する。config には hdd/fd1/fd2 の由来情報 (sourceKey/url) を渡す。
   */
  async boot(params: {
    hdd?: { file: DiskFile; sourceKey: string; url?: string };
    fd1?: { file: DiskFile; sourceKey: string; url?: string };
    fd2?: { file: DiskFile; sourceKey: string; url?: string };
    latencyMs?: number;
    extMemMB?: number;
    clkMult?: number;
  }): Promise<void> {
    const fds: Array<{ slot: DiskSlot; file: DiskFile; sourceKey: string; url?: string }> = [];
    if (params.fd1) fds.push({ slot: 'fd1', ...params.fd1 });
    if (params.fd2) fds.push({ slot: 'fd2', ...params.fd2 });

    const bootConfig: BootConfig = {
      hdd: params.hdd?.file,
      fds: fds.map((f) => f.file),
      latencyMs: params.latencyMs,
      extMemMB: params.extMemMB,
      clkMult: params.clkMult,
    };

    try {
      const fs = await bootCore(bootConfig, this.canvas);
      this.fs = fs;

      this.mounted.clear();
      if (params.hdd) {
        this.mounted.set('hdd', {
          slot: 'hdd',
          name: params.hdd.file.name,
          sourceKey: params.hdd.sourceKey,
          url: params.hdd.url,
        });
      }
      for (const fd of fds) {
        this.mounted.set(fd.slot, {
          slot: fd.slot,
          name: fd.file.name,
          sourceKey: fd.sourceKey,
          url: fd.url,
        });
      }

      this.startPersistLoop();
      await this.restoreStateIfPresent();
      this.emit('booted', { fs });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('bootError', { error });
      throw error;
    }
  }

  private startPersistLoop(): void {
    this.stopPersistLoop();
    this.persistTimer = setInterval(() => {
      void this.persistNow();
    }, PERSIST_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.boundOnVisibilityChange);
    window.addEventListener('pagehide', this.boundOnPageHide);
  }

  private stopPersistLoop(): void {
    if (this.persistTimer !== null) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    document.removeEventListener('visibilitychange', this.boundOnVisibilityChange);
    window.removeEventListener('pagehide', this.boundOnPageHide);
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      void this.persistNow();
    }
  }

  /** マウント中の各イメージのうち変化したものだけ IndexedDB へ保存する。 */
  async persistNow(): Promise<void> {
    if (!this.fs) return;
    for (const entry of this.mounted.values()) {
      try {
        const bytes = readDiskFile(this.fs, entry.name);
        if (!this.hasChanged(entry, bytes)) continue;

        await db.put({
          sourceKey: entry.sourceKey,
          url: entry.url,
          name: entry.name,
          bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
          savedAt: Date.now(),
        });

        entry.lastSavedSnapshot = this.snapshotOf(bytes);
        this.emit('persisted', { slot: entry.slot, name: entry.name });
      } catch (err) {
        this.emit('log', {
          level: 'error',
          message: `persist failed for ${entry.name}: ${String(err)}`,
        });
      }
    }
  }

  private snapshotOf(bytes: Uint8Array): { length: number; head: Uint8Array; tail: Uint8Array } {
    const head = bytes.slice(0, Math.min(COMPARE_CHUNK_BYTES, bytes.length));
    const tail = bytes.slice(Math.max(0, bytes.length - COMPARE_CHUNK_BYTES));
    return { length: bytes.length, head, tail };
  }

  private hasChanged(entry: MountedEntry, bytes: Uint8Array): boolean {
    const prev = entry.lastSavedSnapshot;
    if (!prev) return true;
    if (prev.length !== bytes.length) return true;
    const next = this.snapshotOf(bytes);
    return !bytesEqual(prev.head, next.head) || !bytesEqual(prev.tail, next.tail);
  }

  /** 現在のイメージをダウンロードさせる。 */
  async exportDisk(which: DiskSlot): Promise<void> {
    if (!this.fs) throw new Error('not booted');
    const entry = this.mounted.get(which);
    if (!entry) throw new Error(`no image mounted in ${which}`);
    const bytes = readDiskFile(this.fs, entry.name);
    const blob = new Blob([bytes.slice()], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  /** IndexedDB の保存を削除し、ページをリロードして配布元から再フェッチさせる。 */
  async resetToOriginal(which: DiskSlot): Promise<void> {
    const entry = this.mounted.get(which);
    if (!entry) throw new Error(`no image mounted in ${which}`);
    await db.delete(entry.sourceKey);
    location.reload();
  }

  /** canvas をフルスクリーン表示する。 */
  async fullscreen(): Promise<void> {
    if (this.canvas.requestFullscreen) {
      await this.canvas.requestFullscreen();
    }
  }

  /** マシンをリセットする (pccore_cfgupdate + pccore_reset)。 */
  resetMachine(): void {
    if (!this.fs) throw new Error('not booted');
    coreReset();
  }

  /**
   * 実行中の FD ドライブへイメージを挿入する。既存スロットがマウント中なら先に永続化してから差し替える。
   * IndexedDB に同 sourceKey の保存があればそちらを優先ロードする（前回の続き優先）。
   */
  async insertFd(drive: 1 | 2, file: DiskFile, sourceKey: string, url?: string): Promise<void> {
    if (!this.fs) throw new Error('not booted');
    const slot: DiskSlot = drive === 1 ? 'fd1' : 'fd2';

    if (this.mounted.has(slot)) {
      await this.persistNow();
    }

    let bytes = file.bytes;
    let name = file.name;
    const stored = await db.get(sourceKey);
    if (stored) {
      bytes = new Uint8Array(stored.bytes);
      name = stored.name;
    }

    this.fs.writeFile(`/disk/${name}`, bytes);
    coreSetFdd(drive - 1, `/disk/${name}`);

    this.mounted.set(slot, { slot, name, sourceKey, url, lastSavedSnapshot: undefined });
    this.emit('fdChanged', { drive, name });
  }

  /** 実行中の FD ドライブからイメージを排出する。 */
  async ejectFd(drive: 1 | 2): Promise<void> {
    if (!this.fs) throw new Error('not booted');
    const slot: DiskSlot = drive === 1 ? 'fd1' : 'fd2';
    if (this.mounted.has(slot)) {
      await this.persistNow();
    }
    coreSetFdd(drive - 1, '');
    this.mounted.delete(slot);
    this.emit('fdChanged', { drive, name: undefined });
  }

  /** セーブ用の未フォーマット1.25MB(2HD)ベタイメージを生成する。DOS側でFORMATが必要。 */
  createBlankFd(): DiskFile {
    const existingNames = new Set(Array.from(this.mounted.values()).map((m) => m.name));
    let name = 'blank.xdf';
    for (let i = 2; existingNames.has(name); i++) {
      name = `blank${i}.xdf`;
    }
    return { name, bytes: new Uint8Array(BLANK_FD_BYTES) };
  }

  private primaryEntry(): MountedEntry | undefined {
    return this.mounted.get('hdd') ?? this.mounted.get('fd1') ?? this.mounted.get('fd2');
  }

  /** 現在の実行状態を statsave しIndexedDBへ保存する。キーは主ディスク(hdd→fd1→fd2)のsourceKeyから決める。 */
  async saveState(): Promise<void> {
    if (!this.fs) throw new Error('not booted');
    const primary = this.primaryEntry();
    if (!primary) {
      this.emit('log', { level: 'error', message: 'saveState: no mounted image to key the state by' });
      return;
    }
    // STATFLAG: 負=失敗。正のビットは警告(0x80=WARNING, 0x01=DISKCHG)で保存自体は成功。
    const rc = coreStatSave(STATE_PATH);
    if (rc < 0) {
      this.emit('log', { level: 'error', message: `saveState failed (rc=${rc})` });
      return;
    }
    if (rc !== 0) {
      this.emit('log', { level: 'info', message: `saveState finished with warnings (rc=${rc})` });
    }
    const bytes = this.fs.readFile(STATE_PATH, { encoding: 'binary' });
    await db.put({
      sourceKey: `state:${primary.sourceKey}`,
      name: 'state0.sav',
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      savedAt: Date.now(),
    });
    this.emit('stateSaved', {});
  }

  /** IndexedDBに保存済みのステートがあればMEMFSへ書き戻してからロードする。 */
  async loadState(): Promise<void> {
    if (!this.fs) throw new Error('not booted');
    const primary = this.primaryEntry();
    if (!primary) {
      this.emit('log', { level: 'error', message: 'loadState: no mounted image to key the state by' });
      return;
    }
    if (!this.fs.analyzePath(STATE_PATH).exists) {
      const stored = await db.get(`state:${primary.sourceKey}`);
      if (!stored) {
        this.emit('log', { level: 'error', message: 'loadState: no saved state found' });
        return;
      }
      this.fs.writeFile(STATE_PATH, new Uint8Array(stored.bytes));
    }
    // STATFLAG: 負=失敗。正のビットは警告(0x80=WARNING, 0x01=DISKCHG)で復元自体は成功。
    const rc = coreStatLoad(STATE_PATH);
    if (rc < 0) {
      this.emit('log', { level: 'error', message: `loadState failed (rc=${rc})` });
      return;
    }
    if (rc !== 0) {
      this.emit('log', { level: 'info', message: `loadState finished with warnings (rc=${rc})` });
    }
    this.emit('stateLoaded', {});
  }

  /** boot完了時、IndexedDBに保存済みのステートがあればMEMFSへ先に書き戻しておく（実際のロードはユーザー操作で行う）。 */
  private async restoreStateIfPresent(): Promise<void> {
    if (!this.fs) return;
    const primary = this.primaryEntry();
    if (!primary) return;
    try {
      const stored = await db.get(`state:${primary.sourceKey}`);
      if (stored && !this.fs.analyzePath(STATE_PATH).exists) {
        this.fs.writeFile(STATE_PATH, new Uint8Array(stored.bytes));
      }
    } catch (err) {
      this.emit('log', { level: 'error', message: `restoreStateIfPresent failed: ${String(err)}` });
    }
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
