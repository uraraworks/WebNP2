import { WebNP2 as AppWebNP2 } from '../../../src/api/webnp2.ts';
import type { DisasmLine, Registers } from './types.ts';

export interface DiskFile {
  name: string;
  bytes: Uint8Array;
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
  /** テキストVRAMをデコード済み文字列として読む。 */
  getScreenText(): ScreenText;
}

/** DebuggerControllerが利用するUI非依存のwasmデバッグAPI。 */
export interface WebNP2DebugTarget {
  isBooted(): boolean;
  dbgSetPaused(paused: boolean): void;
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
