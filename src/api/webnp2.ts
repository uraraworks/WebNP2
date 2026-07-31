// API層: CommandBus + WebNP2 クラス。
// UI はこの層を経由してのみコアを操作する（制御プレーン方針。docs/DESIGN.md 参照）。

import {
  boot as bootCore,
  readDiskFile,
  coreReset,
  coreSetFdd,
  coreStatSave,
  coreStatLoad,
  coreKey,
  coreReadTvram,
  corePushKeyBuffer,
  corePushKeyBufferPair,
  coreFindMailbox,
  coreMailboxSpace,
  coreMailboxPut,
  coreMailboxPending,
  coreMouseMove,
  coreMousePending,
  coreMouseButton,
  type BootConfig,
  type DiskFile,
  type EmscriptenFS,
} from '../core/module.ts';
import * as db from '../storage/db.ts';
import { NAMED_KEYS, charToKey } from './keymap.ts';
import { encodeSjisUnits } from './sjis.ts';

const STATE_PATH = '/state0.sav';
const BLANK_FD_BYTES = 1_261_568; // 1.25MB 2HD ベタイメージ

export type DiskSlot = 'hdd' | 'fd1' | 'fd2';

/** キーマクロ1ステップ。runKeySequence に渡す配列の要素。 */
export type KeyStep =
  | { type: 'press'; keys: string; holdMs?: number }
  | { type: 'down'; keys: string }
  | { type: 'up'; keys: string }
  | { type: 'wait'; ms: number }
  | { type: 'text'; text: string }
  | { type: 'paste'; text: string };

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
  /** ホスト側が推定するバスマウスのカーソル位置(0-639, 0-399)。null=未ホーミング(未確定)。 */
  private mousePos: { x: number; y: number } | null = null;

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
    /** 登録済みROM/素材ファイル。読み取り専用扱いで、mount管理・永続化ループの対象にはしない。 */
    roms?: DiskFile[];
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
      roms: params.roms,
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

  private validateSlot(slot: string): string {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(slot)) {
      throw new Error(`invalid slot name: ${slot}`);
    }
    return slot;
  }

  /** 名前付きスロットへ現在の実行状態を statsave し保存する。キーは `state:<主ディスクsourceKey>:<slot>`。 */
  async saveStateSlot(slot: string): Promise<void> {
    if (!this.fs) throw new Error('not booted');
    const safeSlot = this.validateSlot(slot);
    const primary = this.primaryEntry();
    if (!primary) {
      this.emit('log', { level: 'error', message: 'saveStateSlot: no mounted image to key the state by' });
      return;
    }
    const path = `/state_${safeSlot}.sav`;
    const rc = coreStatSave(path);
    if (rc < 0) {
      this.emit('log', { level: 'error', message: `saveStateSlot(${safeSlot}) failed (rc=${rc})` });
      return;
    }
    if (rc !== 0) {
      this.emit('log', { level: 'info', message: `saveStateSlot(${safeSlot}) finished with warnings (rc=${rc})` });
    }
    const bytes = this.fs.readFile(path, { encoding: 'binary' });
    await db.put({
      sourceKey: `state:${primary.sourceKey}:${safeSlot}`,
      name: `state_${safeSlot}.sav`,
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      savedAt: Date.now(),
    });
    this.emit('stateSaved', {});
  }

  /** 名前付きスロットからIndexedDBに保存済みのステートをMEMFSへ書き戻してロードする。 */
  async loadStateSlot(slot: string): Promise<void> {
    if (!this.fs) throw new Error('not booted');
    const safeSlot = this.validateSlot(slot);
    const primary = this.primaryEntry();
    if (!primary) {
      this.emit('log', { level: 'error', message: 'loadStateSlot: no mounted image to key the state by' });
      return;
    }
    const path = `/state_${safeSlot}.sav`;
    const stored = await db.get(`state:${primary.sourceKey}:${safeSlot}`);
    if (!stored) {
      this.emit('log', { level: 'error', message: `loadStateSlot: no saved state found for slot "${safeSlot}"` });
      return;
    }
    this.fs.writeFile(path, new Uint8Array(stored.bytes));
    const rc = coreStatLoad(path);
    if (rc < 0) {
      this.emit('log', { level: 'error', message: `loadStateSlot(${safeSlot}) failed (rc=${rc})` });
      return;
    }
    if (rc !== 0) {
      this.emit('log', { level: 'info', message: `loadStateSlot(${safeSlot}) finished with warnings (rc=${rc})` });
    }
    this.emit('stateLoaded', {});
  }

  /** 保存済みのステートスロット一覧を、保存日時の新しい順で返す。 */
  async listStateSlots(): Promise<Array<{ slot: string; savedAt: number }>> {
    const primary = this.primaryEntry();
    if (!primary) return [];
    const prefix = `state:${primary.sourceKey}:`;
    const stored = await db.getAllByPrefix(prefix);
    return stored
      .map((s) => ({ slot: s.sourceKey.slice(prefix.length), savedAt: s.savedAt }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  /**
   * 画面テキストが変化し、その後 stableMs の間変化が止まるまで待つ。
   * ロード完了やコマンド終了検出など、待つべき文字列が未知な場合に固定sleepの代わりに使う。
   * stableMs は既定800ms(最大5000ms)、timeoutMs は既定15000ms(最大60000ms)にクランプ。
   * 一度も変化が無いままタイムアウトした場合は changed:false を返す。
   */
  async waitScreenChange(opts?: { stableMs?: number; timeoutMs?: number }): Promise<{ changed: boolean; text: string }> {
    if (!this.isBooted()) throw new Error('not booted');
    const stableMs = Math.min(Math.max(opts?.stableMs ?? 800, 0), 5000);
    const timeoutMs = Math.min(Math.max(opts?.timeoutMs ?? 15000, 0), 60000);
    const start = Date.now();
    const baseline = this.getScreenText().text;

    let lastText = baseline;
    let changed = false;
    let lastChangeAt = Date.now();

    for (;;) {
      const now = Date.now();
      if (!changed) {
        if (now - start >= timeoutMs) {
          return { changed: false, text: lastText };
        }
      } else if (now - lastChangeAt >= stableMs) {
        return { changed: true, text: lastText };
      } else if (now - start >= timeoutMs) {
        return { changed: true, text: lastText };
      }

      await this.sleep(200);
      const text = this.getScreenText().text;
      if (text !== lastText) {
        changed = true;
        lastChangeAt = Date.now();
      }
      lastText = text;
    }
  }

  /** テキストVRAMを読み出し、SJISデコード済みの画面テキストとカーソル位置を返す。 */
  getScreenText(): {
    text: string;
    lines: string[];
    cursor: { row: number; col: number } | null;
  } {
    const buf = coreReadTvram();
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const cols = buf[0];
    const rows = buf[1];
    const cursorCell = view.getInt16(2, true);

    const lines: string[] = [];
    const decoder = new TextDecoder('shift_jis' as string);
    let cellIndex = 0;
    for (let row = 0; row < rows; row++) {
      const bytes: number[] = [];
      let prevWasWide = false;
      for (let col = 0; col < cols; col++) {
        const offset = 4 + cellIndex * 2;
        const cell = view.getUint16(offset, true);
        cellIndex++;

        if (cell === 0x0000) {
          if (prevWasWide) {
            prevWasWide = false;
            continue;
          }
          bytes.push(0x2e);
          continue;
        }

        const hi = cell >> 8;
        if (cell <= 0x00ff) {
          if ((cell >= 0x20 && cell <= 0x7e) || (cell >= 0xa1 && cell <= 0xdf)) {
            bytes.push(cell);
          } else {
            bytes.push(0x2e);
          }
          prevWasWide = false;
          continue;
        }

        if (hi >= 0x21) {
          const j1 = hi;
          const j2 = cell & 0xff;
          const s1 = ((j1 + 1) >> 1) + (j1 < 0x5f ? 0x70 : 0xb0);
          const s2 = j2 + (j1 & 1 ? (j2 < 0x60 ? 0x1f : 0x20) : 0x7e);
          bytes.push(s1 & 0xff, s2 & 0xff);
          prevWasWide = true;
          continue;
        }

        bytes.push(0x2e);
        prevWasWide = false;
      }
      const line = decoder.decode(new Uint8Array(bytes)).trimEnd();
      lines.push(line);
    }

    return {
      text: lines.join('\n'),
      lines,
      cursor: cursorCell >= 0 ? { row: Math.floor(cursorCell / cols), col: cursorCell % cols } : null,
    };
  }

  /** PC-98スキャンコードを1回注入する。 */
  sendKey(code: number, down: boolean): void {
    if (!this.isBooted()) throw new Error('not booted');
    coreKey(code, down);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * バスマウスの相対移動を、コアが一度に飲み込める量(±64)に分割して送る。
   * 各ステップ後、コアが移動量を消費し切る(webnp2_mouse_pending()が0になる)まで
   * 最大300ms待つ(10ms間隔)。ゲスト側がマウスを読まないソフトでハングしないよう、
   * 0にならなくても諦めて次のステップへ進む。
   */
  private async mouseStep(dx: number, dy: number): Promise<void> {
    const MAX_STEP = 64;
    const steps = Math.max(Math.ceil(Math.abs(dx) / MAX_STEP), Math.ceil(Math.abs(dy) / MAX_STEP), dx === 0 && dy === 0 ? 0 : 1);
    for (let i = 0; i < steps; i++) {
      const remaining = steps - i;
      const stepDx = Math.trunc(dx / remaining);
      const stepDy = Math.trunc(dy / remaining);
      dx -= stepDx;
      dy -= stepDy;
      coreMouseMove(stepDx, stepDy);
      const waitStart = Date.now();
      while (coreMousePending() !== 0 && Date.now() - waitStart < 300) {
        await this.sleep(10);
      }
    }
  }

  /**
   * バスマウスを画面外まで大きく動かして左上へ押し付ける(ホーミング)。
   * PC-98バスマウスは相対移動のみでカーソル位置はゲスト側が保持するため、
   * 絶対座標指定はここを基準に相対移動を積み上げて行う。
   */
  async mouseHome(): Promise<void> {
    if (!this.isBooted()) throw new Error('not booted');
    await this.mouseStep(-1600, -1000);
    this.mousePos = { x: 0, y: 0 };
  }

  /**
   * マウスカーソルを画面座標(x,y)へ移動する。x,yは0-639/0-399にクランプされる。
   * 現在位置が未確定(未ホーミング)なら先に mouseHome() する。
   * 戻り値は移動後のホスト側推定位置。
   */
  async mouseMoveTo(x: number, y: number): Promise<{ x: number; y: number }> {
    if (!this.isBooted()) throw new Error('not booted');
    const clampedX = Math.min(Math.max(Math.round(x), 0), 639);
    const clampedY = Math.min(Math.max(Math.round(y), 0), 399);
    if (!this.mousePos) {
      await this.mouseHome();
    }
    const from = this.mousePos as { x: number; y: number };
    await this.mouseStep(clampedX - from.x, clampedY - from.y);
    this.mousePos = { x: clampedX, y: clampedY };
    return this.mousePos;
  }

  /** 現在のホスト側推定マウス位置を返す。未ホーミングなら null。 */
  getMousePosition(): { x: number; y: number } | null {
    return this.mousePos;
  }

  /**
   * マウスクリックを送る。x,y指定があれば先に mouseMoveTo する。
   * button既定は'left'、count既定1(最大3、ダブル/トリプルクリック用)。
   */
  async mouseClick(opts?: { x?: number; y?: number; button?: 'left' | 'right'; count?: number }): Promise<void> {
    if (!this.isBooted()) throw new Error('not booted');
    if (opts?.x !== undefined && opts?.y !== undefined) {
      await this.mouseMoveTo(opts.x, opts.y);
    }
    const button = opts?.button === 'right' ? 1 : 0;
    const count = Math.min(Math.max(opts?.count ?? 1, 1), 3);
    for (let i = 0; i < count; i++) {
      coreMouseButton(button, 1);
      await this.sleep(80);
      coreMouseButton(button, 0);
      if (i < count - 1) {
        await this.sleep(120);
      }
    }
  }

  /** from から to へドラッグする(移動→押下→移動→解放)。button既定'left'。 */
  async mouseDrag(from: { x: number; y: number }, to: { x: number; y: number }, button?: 'left' | 'right'): Promise<void> {
    if (!this.isBooted()) throw new Error('not booted');
    const btn = button === 'right' ? 1 : 0;
    await this.mouseMoveTo(from.x, from.y);
    coreMouseButton(btn, 1);
    await this.sleep(100);
    await this.mouseMoveTo(to.x, to.y);
    await this.sleep(100);
    coreMouseButton(btn, 0);
  }

  /**
   * 画面テキスト(getScreenText().lines)からneedleを含む位置(行・列)を検索する。
   * colは文字インデックス(全角文字を含む行でもlinesは既にデコード済み文字列のため)。
   * opts.all=falseまたは省略時は最初の1件のみ、trueなら全件を返す。大文字小文字は区別する。
   */
  findScreenText(needle: string, opts?: { all?: boolean }): Array<{ row: number; col: number; text: string }> {
    const { lines } = this.getScreenText();
    const results: Array<{ row: number; col: number; text: string }> = [];
    if (needle.length === 0) return results;
    for (let row = 0; row < lines.length; row++) {
      const line = lines[row];
      let fromIndex = 0;
      for (;;) {
        const col = line.indexOf(needle, fromIndex);
        if (col < 0) break;
        results.push({ row, col, text: line });
        if (!opts?.all) return results;
        fromIndex = col + needle.length;
      }
    }
    return results;
  }

  /**
   * 画面テキスト中のneedleを見つけてクリックする。occurrence(既定0=最初)番目の一致を使う。
   * テキストセルサイズ(横8px×縦16px、80x25で640x400)から x = col*8+4, y = row*16+8 を計算する。
   * 見つからなければ found:false を返す。
   */
  async clickScreenText(needle: string, opts?: { button?: 'left' | 'right'; occurrence?: number }): Promise<{ found: boolean; x?: number; y?: number }> {
    if (!this.isBooted()) throw new Error('not booted');
    const occurrence = opts?.occurrence ?? 0;
    const matches = this.findScreenText(needle, { all: true });
    const match = matches[occurrence];
    if (!match) {
      return { found: false };
    }
    const x = match.col * 8 + 4;
    const y = match.row * 16 + 8;
    await this.mouseClick({ x, y, button: opts?.button });
    return { found: true, x, y };
  }

  /**
   * '+'区切りのキーコンボ文字列("CTRL+C" 等)を修飾キーコード列とメインキーコードへ解決する。
   * 解決できない場合は Error を投げる。
   */
  private resolveCombo(combo: string): { modifierCodes: number[]; mainCode: number } {
    const tokens = combo.split('+').map((t) => t.trim());
    if (tokens.length === 0 || tokens.some((t) => t.length === 0)) {
      throw new Error(`invalid key combo: ${combo}`);
    }
    const mainToken = tokens[tokens.length - 1];
    const modifierTokens = tokens.slice(0, -1).filter((t) => Object.prototype.hasOwnProperty.call(NAMED_KEYS, t.toUpperCase()));
    const modifierCodes = modifierTokens.map((t) => NAMED_KEYS[t.toUpperCase()]);

    let mainCode: number;
    const named = NAMED_KEYS[mainToken.toUpperCase()];
    if (named !== undefined) {
      mainCode = named;
    } else {
      const resolved = charToKey(mainToken);
      if (!resolved) {
        throw new Error(`cannot resolve key: ${mainToken}`);
      }
      mainCode = resolved.code;
    }
    return { modifierCodes, mainCode };
  }

  /**
   * "CTRL+C" や "ENTER" のようなキーコンボを送る。
   * '+'区切りの最後のトークンがメインキー、それ以前は修飾キー(NAMED_KEYSに存在するもののみ)。
   */
  async sendKeys(combo: string): Promise<void> {
    if (!this.isBooted()) throw new Error('not booted');
    const { modifierCodes, mainCode } = this.resolveCombo(combo);

    for (const code of modifierCodes) {
      coreKey(code, true);
      await this.sleep(30);
    }
    coreKey(mainCode, true);
    await this.sleep(30);
    coreKey(mainCode, false);
    await this.sleep(30);
    for (const code of [...modifierCodes].reverse()) {
      coreKey(code, false);
      await this.sleep(30);
    }
  }

  /**
   * キー操作のマクロを順番に実行する(press/down/up/wait/text/paste)。
   * 長押し(holdMs指定のpress)や押しっぱなし→他操作→離す、といったキーシーケンスの再現に使う。
   * ステップ単体は最大10秒待ちにクランプ、シーケンス全体の累積待ち時間は60秒を超えるとErrorを投げる。
   * 例外発生時も、down で押しっぱなしのままのキーはすべて try/finally で自動的に up する。
   */
  async runKeySequence(steps: KeyStep[]): Promise<{ executed: number }> {
    if (!this.isBooted()) throw new Error('not booted');
    const MAX_STEP_WAIT_MS = 10_000;
    const MAX_TOTAL_WAIT_MS = 60_000;
    const heldCodes = new Set<number>();
    let totalWaitMs = 0;
    let executed = 0;

    const waitClamped = async (ms: number): Promise<void> => {
      const clamped = Math.min(Math.max(ms, 0), MAX_STEP_WAIT_MS);
      totalWaitMs += clamped;
      if (totalWaitMs > MAX_TOTAL_WAIT_MS) {
        throw new Error(`runKeySequence: total wait time exceeded ${MAX_TOTAL_WAIT_MS}ms limit`);
      }
      await this.sleep(clamped);
    };

    const keyDown = async (code: number): Promise<void> => {
      coreKey(code, true);
      heldCodes.add(code);
      await waitClamped(30);
    };
    const keyUp = async (code: number): Promise<void> => {
      coreKey(code, false);
      heldCodes.delete(code);
      await waitClamped(30);
    };

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        try {
          switch (step.type) {
            case 'press': {
              const { modifierCodes, mainCode } = this.resolveCombo(step.keys);
              for (const code of modifierCodes) await keyDown(code);
              await keyDown(mainCode);
              await waitClamped(step.holdMs ?? 30);
              await keyUp(mainCode);
              for (const code of [...modifierCodes].reverse()) await keyUp(code);
              break;
            }
            case 'down': {
              const { modifierCodes, mainCode } = this.resolveCombo(step.keys);
              for (const code of modifierCodes) await keyDown(code);
              await keyDown(mainCode);
              break;
            }
            case 'up': {
              const { modifierCodes, mainCode } = this.resolveCombo(step.keys);
              await keyUp(mainCode);
              for (const code of [...modifierCodes].reverse()) await keyUp(code);
              break;
            }
            case 'wait': {
              await waitClamped(step.ms);
              break;
            }
            case 'text': {
              await this.typeText(step.text);
              break;
            }
            case 'paste': {
              await this.pasteText(step.text);
              break;
            }
            default: {
              const exhaustive: never = step;
              throw new Error(`unknown step type: ${JSON.stringify(exhaustive)}`);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`runKeySequence: step ${i} (${step.type}) failed: ${message}`);
        }
        executed++;
      }
    } finally {
      for (const code of Array.from(heldCodes).reverse()) {
        coreKey(code, false);
        heldCodes.delete(code);
      }
    }

    return { executed };
  }

  /** 文字列を1文字ずつキー入力として送る。解決できない文字はスキップしログ通知する。 */
  async typeText(text: string): Promise<void> {
    if (!this.isBooted()) throw new Error('not booted');
    for (const ch of text) {
      const resolved = charToKey(ch);
      if (!resolved) {
        this.emit('log', { level: 'info', message: `typeText: skipped unresolvable char ${JSON.stringify(ch)}` });
        continue;
      }
      const { code, shift } = resolved;
      if (shift) {
        coreKey(NAMED_KEYS.SHIFT, true);
        await this.sleep(30);
        coreKey(code, true);
        await this.sleep(30);
        coreKey(code, false);
        await this.sleep(30);
        coreKey(NAMED_KEYS.SHIFT, false);
        await this.sleep(30);
      } else {
        coreKey(code, true);
        await this.sleep(30);
        coreKey(code, false);
        await this.sleep(30);
      }
    }
  }

  /**
   * ホスト側からテキストを送信する。ゲスト常駐TSR(PASTE.COM)のメールボックスが
   * 見つかればそちら経由(TSR経路)、無ければ従来のキーバッファ直接注入(キーバッファ経路)
   * を自動的に使い分ける。
   */
  async pasteText(text: string): Promise<{ sent: number; skipped: string[] }> {
    if (!this.isBooted()) throw new Error('not booted');

    let mailbox = -1;
    try {
      mailbox = coreFindMailbox();
    } catch {
      mailbox = -1;
    }
    if (mailbox >= 0) {
      return this.pasteTextViaMailbox(mailbox, text);
    }
    return this.pasteTextViaKeyBuffer(text);
  }

  /**
   * TSR経路: SJISバイト列をメールボックスのリングバッファへ書き込む。
   * DOSが旧ハンドラ内で入力待ちブロック中だと次の入力要求まで読まれないため、
   * 書き込み後に空きが全量(255)へ戻っていなければCR(0x0D)を1つキーバッファへ送り、
   * 現在の入力待ちを完了させて次の要求でTSRに拾わせる。
   */
  private async pasteTextViaMailbox(mailbox: number, text: string): Promise<{ sent: number; skipped: string[] }> {
    const { units, skipped } = encodeSjisUnits(text);
    const bytes = units.flat();

    coreMailboxPending(mailbox, 1);
    let sent = 0;
    for (const byte of bytes) {
      for (;;) {
        const ok = coreMailboxPut(mailbox, byte);
        if (ok) break;
        await this.sleep(20);
      }
      sent++;
    }
    coreMailboxPending(mailbox, 0);

    await this.sleep(600);
    if (coreMailboxSpace(mailbox) < 255) {
      corePushKeyBuffer(0x0d);
    }

    return { sent, skipped };
  }

  /**
   * キーバッファ経路(従来): SJISバイト列(1バイト=1エントリ、上位scan=0)を
   * PC-98キーボードBIOSリングバッファへ直接積む。ゲスト側FEP無しで全角文字を
   * 入力できる。バッファは16エントリしかないため、満杯時は20ms待って再試行する
   * バックプレッシャで長文を流す。
   */
  private async pasteTextViaKeyBuffer(text: string): Promise<{ sent: number; skipped: string[] }> {
    const { units, skipped } = encodeSjisUnits(text);

    // SJIS 2バイト文字は corePushKeyBufferPair でアトミックに積む。
    // 1バイトずつ積むと間でゲストが先行バイトだけ消費し、DBCSペアが
    // 崩れて化ける(「漢」の2バイト目0xBFが半角｢ｿ｣になる等)。
    let sent = 0;
    let unitCount = 0;
    for (const unit of units) {
      for (;;) {
        const ok = unit.length === 2 ? corePushKeyBufferPair(unit[0], unit[1]) : corePushKeyBuffer(unit[0]);
        if (ok) break;
        await this.sleep(20);
      }
      sent += unit.length;
      unitCount++;
      if (unitCount % 4 === 0) {
        await this.sleep(10);
      }
    }

    return { sent, skipped };
  }

  /**
   * 画面テキストに指定文字列が現れるまでポーリングして待つ。固定sleepの代わりに使う。
   * timeoutMs は 60000ms にクランプ。タイムアウト時は found:false と最後に読んだテキストを返す。
   */
  async waitScreenText(contains: string, timeoutMs = 10000): Promise<{ found: boolean; text: string }> {
    if (!this.isBooted()) throw new Error('not booted');
    const clampedTimeout = Math.min(Math.max(timeoutMs, 0), 60000);
    const start = Date.now();
    let lastText = '';
    for (;;) {
      lastText = this.getScreenText().text;
      if (lastText.includes(contains)) {
        return { found: true, text: lastText };
      }
      if (Date.now() - start >= clampedTimeout) {
        return { found: false, text: lastText };
      }
      await this.sleep(200);
    }
  }

  /**
   * ゲストへペースト用TSR(PASTE.COM)入りツールFDを一時挿入し実行して、
   * 全角ペーストのTSR経路を有効化する。既に有効ならFD挿入せず即成功を返す。
   * mount管理には登録しない(一時挿入のため)。
   */
  async setupPasteHelper(opts?: { drive?: 1 | 2; command?: string }): Promise<{ ok: boolean; message: string }> {
    if (!this.fs) throw new Error('not booted');

    try {
      if (coreFindMailbox() >= 0) {
        return { ok: true, message: 'paste helper is already resident' };
      }
    } catch {
      // ccall未定義等は下の通常セットアップへフォールスルー。
    }

    const drive = opts?.drive ?? 1;
    const command = opts?.command ?? 'b:paste';

    let bytes: Uint8Array;
    try {
      const res = await fetch('./tools/webnp2tools.xdf');
      if (!res.ok) {
        return { ok: false, message: `failed to fetch webnp2tools.xdf (HTTP ${res.status})` };
      }
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      return { ok: false, message: `failed to fetch webnp2tools.xdf: ${String(err)}` };
    }

    this.fs.writeFile('/disk/webnp2tools.xdf', bytes);
    coreSetFdd(drive - 1, '/disk/webnp2tools.xdf');

    await this.sleep(800);
    await this.typeText(`${command}\n`);

    const pollStart = Date.now();
    for (;;) {
      let mailbox = -1;
      try {
        mailbox = coreFindMailbox();
      } catch {
        mailbox = -1;
      }
      if (mailbox >= 0) {
        return { ok: true, message: 'paste helper is now resident' };
      }
      if (Date.now() - pollStart >= 8000) {
        return {
          ok: false,
          message: `paste helper not detected. DOSプロンプトで ${command} を実行してください`,
        };
      }
      await this.sleep(500);
    }
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
