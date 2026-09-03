import { WebNP2 as AppWebNP2 } from '../../../src/api/webnp2.ts';
import type { DisasmLine, Registers } from './types.ts';

export interface DiskFile {
  name: string;
  bytes: Uint8Array;
}

/** HOSTDRVのアクセス権限。'ro'=読みのみ、'rw'=読み書き(既定)、'rwd'=削除まで許可。 */
export type HostDrvAccess = 'ro' | 'rw' | 'rwd';

/**
 * HOSTDRV(ホストディレクトリをゲストDOSドライブとして見せる機能)の設定。
 * src/core/module.ts の HostDrvConfig と同じ形。省略時HOSTDRVは無効。
 */
export interface HostDrvConfig {
  /** ゲストから見えるMEMFS上のルートパス。省略時 '/hostdrv'。 */
  root?: string;
  /** アクセス権限。省略時 'rw'。 */
  access?: HostDrvAccess;
  /** 起動時にrootディレクトリ直下へ配置するファイル。 */
  files?: DiskFile[];
}

export type DiskSlot = 'hdd' | 'fd1' | 'fd2';

export interface EngineBootDisk {
  file: DiskFile;
  sourceKey: string;
  url?: string;
  alreadyPersisted?: boolean;
}

export interface EngineBootOptions {
  hdd?: EngineBootDisk;
  fd1?: EngineBootDisk;
  fd2?: EngineBootDisk;
  latencyMs?: number;
  extMemMB?: number;
  clkMult?: number;
  roms?: DiskFile[];
  /** HOSTDRV設定。省略時は無効。 */
  hostdrv?: HostDrvConfig;
}

export interface MountedImage {
  slot: DiskSlot;
  name: string;
  sourceKey: string;
  url?: string;
}

export interface ScreenText {
  text: string;
  lines: string[];
  cursor: { row: number; col: number } | null;
}

export interface PasteTextResult {
  sent: number;
  skipped: string[];
}

/** UIを持たない埋め込み用エンジンAPI。 */
export interface WebNP2Engine {
  isBooted(): boolean;
  boot(options: EngineBootOptions): Promise<void>;
  resetMachine(): void;
  insertFd(drive: 1 | 2, file: DiskFile, sourceKey: string, url?: string): Promise<void>;
  ejectFd(drive: 1 | 2): Promise<void>;
  getMountedImages(): MountedImage[];
  saveState(): Promise<void>;
  loadState(): Promise<void>;
  /** BIOSキーバッファ経由でゲストへ文字列を送り、DOSコマンド等を実行する。 */
  pasteText(text: string): Promise<PasteTextResult>;
  /**
   * "F9" や "CTRL+C" のようなキーコンボを送る。pasteTextでは表現できない
   * ファンクションキー操作(起動時メニューの終了など)に使う。
   */
  sendKeys(combo: string): Promise<void>;
  /** テキストVRAMをデコード済み文字列として読む。 */
  getScreenText(): ScreenText;
  /**
   * hostdrvルート直下へファイルを書き込む(IDEがビルド成果物をゲストへ渡す用途)。
   * boot()にhostdrvを渡していない場合はErrorを投げる。nameは'/'を含まないルート直下の
   * ファイル名のみ許可(パストラバーサル防止)。
   */
  writeHostFile(name: string, bytes: Uint8Array): void;
  /** hostdrvルート直下のファイルを読む。無ければnull。boot()にhostdrv未設定ならError。 */
  readHostFile(name: string): Uint8Array | null;
  /** hostdrvルート直下のファイル名一覧を返す。boot()にhostdrv未設定ならError。 */
  listHostFiles(): string[];
  /** hostdrvルート直下のファイルを削除する。存在しなければfalse。boot()にhostdrv未設定ならError。 */
  deleteHostFile(name: string): boolean;
}

/** DebuggerControllerが利用するUI非依存のwasmデバッグAPI。 */
export interface WebNP2DebugTarget {
  isBooted(): boolean;
  dbgSetPaused(paused: boolean): void;
  /** ポーズ中のイベントループ待ち時間(ms)を切り替える。 */
  dbgSetPauseSleepMs(ms: number): void;
  dbgIsPaused(): boolean;
  dbgStep(count: number): number;
  dbgReadRegs(): Registers;
  dbgDisasm(seg: number, off: number, count: number): DisasmLine[];
  dbgSetBreakpoint(index: number, seg: number, off: number, enabled: boolean): void;
  dbgRunUntilBreakpoint(maxSteps: number): number;
  readMemoryBase64(addr: number, len: number): { addr: number; len: number; base64: string };
  writeMemoryBase64(addr: number, base64: string): { addr: number; len: number };
}

export type WebNP2Embed = WebNP2Engine & WebNP2DebugTarget;

/**
 * canvasを出力先として単一のNP2kaiエンジンを生成する。
 * 現在の非MODULARIZE SDL2コアはwindow.Moduleを使うため、1ページ1インスタンスに限る。
 */
export function createWebNP2(canvas: HTMLCanvasElement): WebNP2Embed {
  return new AppWebNP2(canvas) as WebNP2Embed;
}
