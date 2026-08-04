// WebNP2アプリ用デバッガパネル。表示部品はpackages/embedをdogfoodingし、
// このファイルはパネル配置・BPスロット管理・アプリi18n注入だけを担当する。

import type { DisasmLine, Registers } from '../../packages/embed/src/index.ts';
import {
  breakpointKey,
  mountDebuggerToolbar,
  mountDisassemblyView,
  mountMemoryDump,
  mountRegisterView,
} from '../../packages/embed/src/index.ts';
import { t } from './strings.ts';

export interface DebuggerCallbacks {
  isBooted(): boolean;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  step(count: number): number;
  readRegs(): Registers;
  disasm(seg: number, off: number, count: number): DisasmLine[];
  setBreakpoint(index: number, seg: number, off: number, enabled: boolean): void;
  runUntilBreakpoint(maxSteps: number): number;
  readMemory(addr: number, len: number): Uint8Array;
}

export interface DebuggerDialog {
  open(): void;
  setEnabled(enabled: boolean): void;
  applyStrings(): void;
}

const DISASM_LINES = 25;
const MAX_BREAKPOINTS = 8;
const RUN_MAX_STEPS = 100_000;
const MEMORY_BYTES = 128;

interface Breakpoint { index: number; seg: number; off: number }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  return node;
}

function hex(value: number, width: number): string {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function toolbarLabels() {
  return {
    pause: t('debuggerPause'), resume: t('debuggerResume'), step: t('debuggerStep'),
    step10: t('debuggerStep10'), runToBreakpoint: t('debuggerRunToBp'), close: t('debuggerClose'),
  };
}

export function buildDebuggerDialog(
  container: HTMLElement,
  callbacks: DebuggerCallbacks,
  layoutRoot: HTMLElement = container,
): DebuggerDialog {
  const title = el('h2', { class: 'debugger-title' });
  const toolbarHost = el('div');
  const status = el('div', { class: 'debugger-status', role: 'status' });
  const registersTitle = el('h3', { class: 'debugger-section-title' });
  const registerHost = el('div');
  const disasmTitle = el('h3', { class: 'debugger-section-title' });
  const disasmHost = el('div');
  const registerSection = el('section', { class: 'debugger-register-section' });
  registerSection.append(registersTitle, registerHost);
  const disasmSection = el('section', { class: 'debugger-disasm-section' });
  disasmSection.append(disasmTitle, disasmHost);
  const body = el('div', { class: 'debugger-body' }); body.append(registerSection, disasmSection);
  const memoryTitle = el('h3', { class: 'debugger-section-title' });
  const memoryHost = el('div');
  const memorySection = el('section', { class: 'debugger-memory-section' });
  memorySection.append(memoryTitle, memoryHost);
  const panel = el('div', { class: 'debugger-modal', role: 'dialog', 'aria-modal': 'true' });
  panel.append(title, toolbarHost, status, body, memorySection);
  const backdrop = el('div', { class: 'rom-modal-backdrop debugger-backdrop hidden' }); backdrop.append(panel);
  container.append(backdrop);
  for (const host of [toolbarHost, registerHost, disasmHost, memoryHost]) host.style.display = 'contents';

  let enabled = false;
  let regs: Registers | undefined;
  let lines: DisasmLine[] = [];
  const breakpoints = new Map<string, Breakpoint>();
  const registerView = mountRegisterView(registerHost);
  const disassemblyView = mountDisassemblyView(disasmHost, {
    addBreakpointLabel: t('debuggerAddBreakpoint'),
    removeBreakpointLabel: t('debuggerRemoveBreakpoint'),
    onToggleBreakpoint: toggleBreakpoint,
  });
  const memoryView = mountMemoryDump(memoryHost, {
    labels: {
      address: t('debuggerMemoryAddress'), read: t('debuggerMemoryRead'), invalidAddress: t('debuggerMemoryInvalid'),
    },
    onRead: (addr) => callbacks.readMemory(addr, MEMORY_BYTES),
    onError: (message) => setStatus(message, true),
  });
  const toolbar = mountDebuggerToolbar(toolbarHost, {
    labels: toolbarLabels(),
    onPauseToggle: () => {
      const paused = callbacks.isPaused(); callbacks.setPaused(!paused);
      setStatus(t(paused ? 'debuggerResumed' : 'debuggerPaused'));
      if (!paused) refresh(); else updateToolbar();
    },
    onStep: (count) => {
      setStatus(t('debuggerStepped', { count: callbacks.step(count) })); refresh();
    },
    onRunToBreakpoint: () => {
      const hit = callbacks.runUntilBreakpoint(RUN_MAX_STEPS);
      setStatus(hit >= 0 ? t('debuggerBreakpointHit', { index: hit }) : t('debuggerBreakpointMiss'));
      refresh();
    },
    onClose: close,
  });

  function setStatus(message: string, error = false): void {
    status.textContent = message; status.classList.toggle('error', error);
  }
  function updateToolbar(): void {
    const paused = enabled && callbacks.isBooted() && callbacks.isPaused();
    toolbar.update({ enabled, paused, hasBreakpoints: breakpoints.size > 0 });
    memoryView.setEnabled(enabled);
  }
  function renderDisassembly(): void {
    if (!regs) return;
    disassemblyView.update({ seg: regs.cs, eip: regs.eip, lines, breakpoints: new Set(breakpoints.keys()) });
  }
  function refresh(): void {
    if (!enabled || !callbacks.isBooted()) return;
    regs = callbacks.readRegs(); lines = callbacks.disasm(regs.cs, regs.eip, DISASM_LINES);
    registerView.update(regs); renderDisassembly(); updateToolbar();
  }
  function toggleBreakpoint(seg: number, off: number): void {
    const key = breakpointKey(seg, off); const existing = breakpoints.get(key);
    if (existing) {
      callbacks.setBreakpoint(existing.index, seg, off, false); breakpoints.delete(key);
      setStatus(t('debuggerBreakpointRemoved', { seg: hex(seg, 4), off: hex(off, 8) }));
    } else {
      const used = new Set(Array.from(breakpoints.values(), (bp) => bp.index));
      let index = -1; for (let i = 0; i < MAX_BREAKPOINTS; i++) if (!used.has(i)) { index = i; break; }
      if (index < 0) { setStatus(t('debuggerBreakpointLimit'), true); return; }
      callbacks.setBreakpoint(index, seg, off, true); breakpoints.set(key, { index, seg, off });
      setStatus(t('debuggerBreakpointAdded', { index, seg: hex(seg, 4), off: hex(off, 8) }));
    }
    renderDisassembly(); updateToolbar();
  }
  function notifyLayoutChanged(): void { requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }
  function close(): void {
    backdrop.classList.add('hidden'); layoutRoot.classList.remove('debugger-docked'); notifyLayoutChanged();
  }
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });

  const applyStrings = (): void => {
    title.textContent = t('debuggerTitle'); registersTitle.textContent = t('debuggerRegisters');
    disasmTitle.textContent = t('debuggerDisassembly'); memoryTitle.textContent = t('debuggerMemory');
    toolbar.setLabels(toolbarLabels());
    disassemblyView.setLabels({ addBreakpoint: t('debuggerAddBreakpoint'), removeBreakpoint: t('debuggerRemoveBreakpoint') });
    memoryView.setLabels({
      address: t('debuggerMemoryAddress'), read: t('debuggerMemoryRead'), invalidAddress: t('debuggerMemoryInvalid'),
    });
  };
  applyStrings(); updateToolbar();
  return {
    open() { if (!enabled) return; layoutRoot.classList.add('debugger-docked'); backdrop.classList.remove('hidden'); setStatus(''); refresh(); notifyLayoutChanged(); },
    setEnabled(next) { enabled = next; if (!next) close(); updateToolbar(); },
    applyStrings,
  };
}
