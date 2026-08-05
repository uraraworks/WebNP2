export { createWebNP2 } from './engine.ts';
export type {
  DiskFile, DiskSlot, EngineBootDisk, EngineBootOptions, MountedImage, PasteTextResult, ScreenText,
  WebNP2DebugTarget, WebNP2Embed, WebNP2Engine,
} from './engine.ts';
export { createDebugger, DebuggerController } from './debugger.ts';
export type { BreakpointEvent, PauseEvent } from './debugger.ts';
export type { DisasmLine, Registers } from './types.ts';
export {
  breakpointKey, mountDebuggerToolbar, mountDisassemblyView, mountMemoryDump, mountRegisterView,
} from './ui.ts';
export type {
  ComponentHandle, DebuggerToolbarHandle, DebuggerToolbarLabels, DisassemblyViewHandle,
  MemoryDumpHandle, MemoryDumpLabels, RegisterViewHandle,
} from './ui.ts';
// 埋め込み側で、起動に渡すディスク像とゲストRAMを独立照合できるよう
// 読み取り専用のFAT APIだけを公開する。書き込みAPIはエンジン境界に残す。
export { fatReadFile, openDiskImage } from '../../../src/api/fat.ts';
export type { FatVolume } from '../../../src/api/fat.ts';
