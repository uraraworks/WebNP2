// API層: CommandBus + WebNP2 クラス。
// UI はこの層を経由してのみコアを操作する（制御プレーン方針。docs/DESIGN.md 参照）。

import { boot as bootCore, readDiskFile, type BootConfig, type DiskFile, type EmscriptenFS } from '../core/module.ts';
import * as db from '../storage/db.ts';

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
  }): Promise<void> {
    const fds: Array<{ slot: DiskSlot; file: DiskFile; sourceKey: string; url?: string }> = [];
    if (params.fd1) fds.push({ slot: 'fd1', ...params.fd1 });
    if (params.fd2) fds.push({ slot: 'fd2', ...params.fd2 });

    const bootConfig: BootConfig = {
      hdd: params.hdd?.file,
      fds: fds.map((f) => f.file),
      latencyMs: params.latencyMs,
      extMemMB: params.extMemMB,
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
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
