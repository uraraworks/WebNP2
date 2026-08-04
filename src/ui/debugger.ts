// デバッガUI。CPU操作はmain.tsから渡されたコールバックだけを使い、
// DOM構築・表示状態・ブレークポイント管理をこのファイルへ集約する。

import type { DisasmLine, Registers } from '../api/webnp2.ts';
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

type RegisterName = keyof Registers;

const REGISTER_NAMES: RegisterName[] = [
  'eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi', 'eip', 'eflags',
  'cs', 'ds', 'es', 'ss', 'fs', 'gs', 'cr0',
];
const SEGMENT_NAMES = new Set<RegisterName>(['cs', 'ds', 'es', 'ss', 'fs', 'gs']);
const EFLAGS = [
  ['CF', 0], ['PF', 2], ['AF', 4], ['ZF', 6], ['SF', 7], ['TF', 8],
  ['IF', 9], ['DF', 10], ['OF', 11],
] as const;
const DISASM_LINES = 25;
const MAX_BREAKPOINTS = 8;
const RUN_MAX_STEPS = 100_000;
const MEMORY_BYTES = 128;

interface Breakpoint {
  index: number;
  seg: number;
  off: number;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function hex(value: number, width: number): string {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function breakpointKey(seg: number, off: number): string {
  return `${seg & 0xffff}:${off >>> 0}`;
}

function flagsText(value: number): string {
  const names = EFLAGS.filter(([, bit]) => (value & (1 << bit)) !== 0).map(([name]) => name);
  return names.length > 0 ? names.join(' ') : '—';
}

/** 既存のrom-modal系モーダルに合わせたデバッガパネルを構築する。 */
export function buildDebuggerDialog(
  container: HTMLElement,
  callbacks: DebuggerCallbacks,
  layoutRoot: HTMLElement = container,
): DebuggerDialog {
  const title = el('h2', { class: 'debugger-title' }, [t('debuggerTitle')]);
  const pauseBtn = el('button', { type: 'button', 'data-debugger-pause': 'true' });
  const stepBtn = el('button', { type: 'button', 'data-debugger-step': 'true' }, [t('debuggerStep')]);
  const step10Btn = el('button', { type: 'button', 'data-debugger-step10': 'true' }, [t('debuggerStep10')]);
  const runBtn = el('button', { type: 'button', 'data-debugger-run': 'true' }, [t('debuggerRunToBp')]);
  const closeBtn = el('button', { type: 'button', class: 'debugger-close-btn' }, [t('debuggerClose')]);
  const toolbar = el('div', { class: 'debugger-toolbar' }, [pauseBtn, stepBtn, step10Btn, runBtn, closeBtn]);
  const status = el('div', { class: 'debugger-status', role: 'status' });

  const registersTitle = el('h3', { class: 'debugger-section-title' }, [t('debuggerRegisters')]);
  const registerGrid = el('div', { class: 'debugger-register-grid' });
  const disasmTitle = el('h3', { class: 'debugger-section-title' }, [t('debuggerDisassembly')]);
  const disasmList = el('div', { class: 'debugger-disasm-list' });
  const memoryTitle = el('h3', { class: 'debugger-section-title' }, [t('debuggerMemory')]);
  const memoryInput = el('input', {
    type: 'text', inputmode: 'text', value: '00000000', class: 'debugger-memory-address',
    'aria-label': t('debuggerMemoryAddress'),
  }) as HTMLInputElement;
  const memoryReadBtn = el('button', { type: 'button', class: 'debugger-memory-read' }, [t('debuggerMemoryRead')]);
  const memoryControls = el('div', { class: 'debugger-memory-controls' }, [memoryInput, memoryReadBtn]);
  const memoryDump = el('div', { class: 'debugger-memory-dump' });
  const memorySection = el('section', { class: 'debugger-memory-section' }, [memoryTitle, memoryControls, memoryDump]);

  const body = el('div', { class: 'debugger-body' }, [
    el('section', { class: 'debugger-register-section' }, [registersTitle, registerGrid]),
    el('section', { class: 'debugger-disasm-section' }, [disasmTitle, disasmList]),
  ]);
  const panel = el('div', { class: 'debugger-modal', role: 'dialog', 'aria-modal': 'true' }, [
    title, toolbar, status, body, memorySection,
  ]);
  const backdrop = el('div', { class: 'rom-modal-backdrop debugger-backdrop hidden' }, [panel]);
  container.append(backdrop);

  let enabled = false;
  let currentRegs: Registers | undefined;
  let displayedRegs: Registers | undefined;
  let currentLines: DisasmLine[] = [];
  const breakpoints = new Map<string, Breakpoint>();

  function setStatus(message: string, error = false): void {
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function notifyLayoutChanged(): void {
    // player.tsの既存リサイズ処理に、ドック開閉後のcanvas再計算を依頼する。
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  function close(): void {
    backdrop.classList.add('hidden');
    layoutRoot.classList.remove('debugger-docked');
    notifyLayoutChanged();
  }

  function updateButtons(): void {
    const paused = enabled && callbacks.isBooted() && callbacks.isPaused();
    pauseBtn.disabled = !enabled;
    stepBtn.disabled = !paused;
    step10Btn.disabled = !paused;
    runBtn.disabled = !paused || breakpoints.size === 0;
    memoryReadBtn.disabled = !enabled;
    pauseBtn.textContent = paused ? t('debuggerResume') : t('debuggerPause');
  }

  function renderRegisters(next: Registers): void {
    registerGrid.replaceChildren();
    for (const name of REGISTER_NAMES) {
      const width = SEGMENT_NAMES.has(name) ? 4 : 8;
      const changed = displayedRegs !== undefined && displayedRegs[name] !== next[name];
      const value = el('span', { class: 'debugger-register-value' }, [hex(next[name], width)]);
      const row = el('div', {
        class: changed ? 'debugger-register changed' : 'debugger-register',
        'data-debugger-register': name,
      }, [el('span', { class: 'debugger-register-name' }, [name.toUpperCase()]), value]);
      if (name === 'eflags') {
        row.append(el('span', { class: 'debugger-flags' }, [flagsText(next.eflags)]));
      }
      registerGrid.append(row);
    }
    displayedRegs = { ...next };
  }

  function renderDisassembly(): void {
    disasmList.replaceChildren();
    if (!currentRegs) return;
    for (const line of currentLines) {
      const key = breakpointKey(currentRegs.cs, line.addr);
      const hasBreakpoint = breakpoints.has(key);
      const current = line.addr === currentRegs.eip;
      const marker = el('span', { class: 'debugger-bp-marker', 'aria-hidden': 'true' }, [hasBreakpoint ? '●' : '○']);
      const address = el('span', { class: 'debugger-disasm-address' }, [
        `${hex(currentRegs.cs, 4)}:${hex(line.addr, 8)}`,
      ]);
      const bytes = el('span', { class: 'debugger-disasm-bytes' }, [
        line.bytes.map((byte) => hex(byte, 2)).join(' '),
      ]);
      const text = el('span', { class: 'debugger-disasm-text' }, [line.text]);
      const row = el('button', {
        type: 'button',
        class: `debugger-disasm-row${current ? ' current' : ''}${hasBreakpoint ? ' breakpoint' : ''}`,
        'data-debugger-disasm-row': 'true',
        'data-seg': String(currentRegs.cs),
        'data-off': String(line.addr),
        'aria-label': t(hasBreakpoint ? 'debuggerRemoveBreakpoint' : 'debuggerAddBreakpoint'),
      }, [marker, address, bytes, text]);
      row.addEventListener('click', () => toggleBreakpoint(currentRegs!.cs, line.addr));
      disasmList.append(row);
    }
  }

  function refresh(): void {
    if (!enabled || !callbacks.isBooted()) return;
    const next = callbacks.readRegs();
    currentRegs = next;
    currentLines = callbacks.disasm(next.cs, next.eip, DISASM_LINES);
    renderRegisters(next);
    renderDisassembly();
    updateButtons();
  }

  function toggleBreakpoint(seg: number, off: number): void {
    const key = breakpointKey(seg, off);
    const existing = breakpoints.get(key);
    if (existing) {
      callbacks.setBreakpoint(existing.index, existing.seg, existing.off, false);
      breakpoints.delete(key);
      setStatus(t('debuggerBreakpointRemoved', { seg: hex(seg, 4), off: hex(off, 8) }));
    } else {
      const used = new Set(Array.from(breakpoints.values(), (bp) => bp.index));
      let index = -1;
      for (let i = 0; i < MAX_BREAKPOINTS; i++) {
        if (!used.has(i)) { index = i; break; }
      }
      if (index < 0) {
        setStatus(t('debuggerBreakpointLimit'), true);
        return;
      }
      callbacks.setBreakpoint(index, seg, off, true);
      breakpoints.set(key, { index, seg, off });
      setStatus(t('debuggerBreakpointAdded', { index, seg: hex(seg, 4), off: hex(off, 8) }));
    }
    renderDisassembly();
    updateButtons();
  }

  function runStep(count: number): void {
    const executed = callbacks.step(count);
    setStatus(t('debuggerStepped', { count: executed }));
    refresh();
  }

  function renderMemory(): void {
    const raw = memoryInput.value.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]+$/i.test(raw)) {
      setStatus(t('debuggerMemoryInvalid'), true);
      return;
    }
    const addr = Number.parseInt(raw, 16);
    try {
      const bytes = callbacks.readMemory(addr, MEMORY_BYTES);
      memoryDump.replaceChildren();
      for (let offset = 0; offset < bytes.length; offset += 16) {
        const chunk = bytes.subarray(offset, offset + 16);
        const byteText = Array.from(chunk, (byte) => hex(byte, 2)).join(' ');
        const ascii = Array.from(chunk, (byte) => byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.').join('');
        memoryDump.append(el('div', { class: 'debugger-memory-row' }, [
          el('span', { class: 'debugger-memory-offset' }, [hex(addr + offset, 8)]),
          el('span', { class: 'debugger-memory-hex' }, [byteText]),
          el('span', { class: 'debugger-memory-ascii' }, [ascii]),
        ]));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  pauseBtn.addEventListener('click', () => {
    const paused = callbacks.isPaused();
    callbacks.setPaused(!paused);
    setStatus(t(paused ? 'debuggerResumed' : 'debuggerPaused'));
    if (!paused) refresh();
    else updateButtons();
  });
  stepBtn.addEventListener('click', () => runStep(1));
  step10Btn.addEventListener('click', () => runStep(10));
  runBtn.addEventListener('click', () => {
    const hit = callbacks.runUntilBreakpoint(RUN_MAX_STEPS);
    setStatus(hit >= 0 ? t('debuggerBreakpointHit', { index: hit }) : t('debuggerBreakpointMiss'));
    refresh();
  });
  memoryReadBtn.addEventListener('click', renderMemory);
  memoryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') renderMemory();
  });
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  return {
    open(): void {
      if (!enabled) return;
      layoutRoot.classList.add('debugger-docked');
      backdrop.classList.remove('hidden');
      setStatus('');
      refresh();
      notifyLayoutChanged();
    },
    setEnabled(next: boolean): void {
      enabled = next;
      if (!next) close();
      updateButtons();
    },
    applyStrings(): void {
      title.textContent = t('debuggerTitle');
      stepBtn.textContent = t('debuggerStep');
      step10Btn.textContent = t('debuggerStep10');
      runBtn.textContent = t('debuggerRunToBp');
      closeBtn.textContent = t('debuggerClose');
      registersTitle.textContent = t('debuggerRegisters');
      disasmTitle.textContent = t('debuggerDisassembly');
      memoryTitle.textContent = t('debuggerMemory');
      memoryInput.setAttribute('aria-label', t('debuggerMemoryAddress'));
      memoryReadBtn.textContent = t('debuggerMemoryRead');
      updateButtons();
      renderDisassembly();
    },
  };
}
