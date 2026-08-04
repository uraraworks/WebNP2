import type { WebNP2DebugTarget } from './engine.ts';
import type { DisasmLine, Registers } from './types.ts';

export interface PauseEvent { paused: boolean }
export interface BreakpointEvent { index: number; registers: Registers }

type Listener<T> = (event: T) => void;

/** 既存wasmデバッグAPIをまとめ、埋め込み側向けの状態変化イベントを付加する。 */
export class DebuggerController {
  private pauseListeners = new Set<Listener<PauseEvent>>();
  private breakpointListeners = new Set<Listener<BreakpointEvent>>();

  constructor(private readonly target: WebNP2DebugTarget) {}

  isBooted(): boolean { return this.target.isBooted(); }
  setPaused(paused: boolean): void {
    this.target.dbgSetPaused(paused);
    const event = { paused: this.target.dbgIsPaused() };
    for (const listener of this.pauseListeners) listener(event);
  }
  isPaused(): boolean { return this.target.dbgIsPaused(); }
  step(count: number): number { return this.target.dbgStep(count); }
  readRegisters(): Registers { return this.target.dbgReadRegs(); }
  disassemble(seg: number, off: number, count: number): DisasmLine[] {
    return this.target.dbgDisasm(seg, off, count);
  }
  setBreakpoint(index: number, seg: number, off: number, enabled: boolean): void {
    this.target.dbgSetBreakpoint(index, seg, off, enabled);
  }
  runUntilBreakpoint(maxSteps: number): number {
    const index = this.target.dbgRunUntilBreakpoint(maxSteps);
    if (index >= 0) {
      const event = { index, registers: this.readRegisters() };
      for (const listener of this.breakpointListeners) listener(event);
    }
    return index;
  }
  readMemory(addr: number, len: number): Uint8Array {
    const binary = atob(this.target.readMemoryBase64(addr, len).base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  /** ゲストRAMへ書き込む。実行中CPUとの競合を避けるためpause中だけ許可する。 */
  writeMemory(addr: number, bytes: Uint8Array): void {
    if (!this.isPaused()) throw new Error('writeMemory requires paused CPU');
    if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array');
    let binary = '';
    const chunkSize = 8192;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    this.target.writeMemoryBase64(addr, btoa(binary));
  }
  onPause(listener: Listener<PauseEvent>): () => void {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }
  onBreakpoint(listener: Listener<BreakpointEvent>): () => void {
    this.breakpointListeners.add(listener);
    return () => this.breakpointListeners.delete(listener);
  }
}

export function createDebugger(target: WebNP2DebugTarget): DebuggerController {
  return new DebuggerController(target);
}
