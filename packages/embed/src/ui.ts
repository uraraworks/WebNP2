import type { DisasmLine, Registers } from './types.ts';

export interface ComponentHandle { destroy(): void }
export interface RegisterViewHandle extends ComponentHandle { update(registers: Registers): void }
export interface DisassemblyViewHandle extends ComponentHandle {
  update(state: { seg: number; eip: number; lines: DisasmLine[]; breakpoints: Set<string> }): void;
  setLabels(labels: { addBreakpoint: string; removeBreakpoint: string }): void;
}
export interface MemoryDumpLabels { address: string; read: string; invalidAddress: string }
export interface MemoryDumpHandle extends ComponentHandle {
  update(addr: number, bytes: Uint8Array): void;
  read(): void;
  setEnabled(enabled: boolean): void;
  setLabels(labels: MemoryDumpLabels): void;
}
export interface DebuggerToolbarHandle extends ComponentHandle {
  update(state: { enabled: boolean; paused: boolean; hasBreakpoints: boolean }): void;
  setLabels(labels: DebuggerToolbarLabels): void;
}

export interface DebuggerToolbarLabels {
  pause: string; resume: string; step: string; step10: string; runToBreakpoint: string; close: string;
}

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

export function breakpointKey(seg: number, off: number): string {
  return `${seg & 0xffff}:${off >>> 0}`;
}

export function mountDebuggerToolbar(
  container: HTMLElement,
  options: {
    labels: DebuggerToolbarLabels;
    onPauseToggle(): void; onStep(count: number): void; onRunToBreakpoint(): void; onClose(): void;
  },
): DebuggerToolbarHandle {
  const root = el('div', { class: 'debugger-toolbar' });
  const pause = el('button', { type: 'button', 'data-debugger-pause': 'true' });
  const step = el('button', { type: 'button', 'data-debugger-step': 'true' });
  const step10 = el('button', { type: 'button', 'data-debugger-step10': 'true' });
  const run = el('button', { type: 'button', 'data-debugger-run': 'true' });
  const close = el('button', { type: 'button', class: 'debugger-close-btn' });
  root.append(pause, step, step10, run, close);
  container.append(root);
  let labels = options.labels;
  let paused = false;
  const applyLabels = (): void => {
    pause.textContent = paused ? labels.resume : labels.pause;
    step.textContent = labels.step; step10.textContent = labels.step10;
    run.textContent = labels.runToBreakpoint; close.textContent = labels.close;
  };
  pause.addEventListener('click', options.onPauseToggle);
  step.addEventListener('click', () => options.onStep(1));
  step10.addEventListener('click', () => options.onStep(10));
  run.addEventListener('click', options.onRunToBreakpoint);
  close.addEventListener('click', options.onClose);
  applyLabels();
  return {
    update(state) {
      paused = state.paused;
      pause.disabled = !state.enabled;
      step.disabled = !state.enabled || !paused;
      step10.disabled = !state.enabled || !paused;
      run.disabled = !state.enabled || !paused || !state.hasBreakpoints;
      applyLabels();
    },
    setLabels(next) { labels = next; applyLabels(); },
    destroy() { root.remove(); },
  };
}

const REGISTER_NAMES: Array<keyof Registers> = [
  'eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi', 'eip', 'eflags',
  'cs', 'ds', 'es', 'ss', 'fs', 'gs', 'cr0',
];
const SEGMENTS = new Set<keyof Registers>(['cs', 'ds', 'es', 'ss', 'fs', 'gs']);
const FLAGS = [['CF', 0], ['PF', 2], ['AF', 4], ['ZF', 6], ['SF', 7], ['TF', 8], ['IF', 9], ['DF', 10], ['OF', 11]] as const;

export function mountRegisterView(container: HTMLElement): RegisterViewHandle {
  const root = el('div', { class: 'debugger-register-grid' });
  container.append(root);
  let previous: Registers | undefined;
  return {
    update(registers) {
      root.replaceChildren();
      for (const name of REGISTER_NAMES) {
        const row = el('div', {
          class: previous && previous[name] !== registers[name] ? 'debugger-register changed' : 'debugger-register',
          'data-debugger-register': name,
        });
        const label = el('span', { class: 'debugger-register-name' }); label.textContent = name.toUpperCase();
        const value = el('span', { class: 'debugger-register-value' });
        value.textContent = hex(registers[name], SEGMENTS.has(name) ? 4 : 8);
        row.append(label, value);
        if (name === 'eflags') {
          const flags = el('span', { class: 'debugger-flags' });
          flags.textContent = FLAGS.filter(([, bit]) => (registers.eflags & (1 << bit)) !== 0).map(([n]) => n).join(' ') || '—';
          row.append(flags);
        }
        root.append(row);
      }
      previous = { ...registers };
    },
    destroy() { root.remove(); },
  };
}

export function mountDisassemblyView(
  container: HTMLElement,
  options: { addBreakpointLabel: string; removeBreakpointLabel: string; onToggleBreakpoint(seg: number, off: number): void },
): DisassemblyViewHandle {
  const root = el('div', { class: 'debugger-disasm-list' }); container.append(root);
  let labels = { addBreakpoint: options.addBreakpointLabel, removeBreakpoint: options.removeBreakpointLabel };
  let lastState: { seg: number; eip: number; lines: DisasmLine[]; breakpoints: Set<string> } | undefined;
  const render = ({ seg, eip, lines, breakpoints }: NonNullable<typeof lastState>): void => {
    root.replaceChildren();
    for (const line of lines) {
      const active = breakpoints.has(breakpointKey(seg, line.addr));
      const row = el('button', {
        type: 'button',
        class: `debugger-disasm-row${line.addr === eip ? ' current' : ''}${active ? ' breakpoint' : ''}`,
        'data-debugger-disasm-row': 'true', 'data-seg': String(seg), 'data-off': String(line.addr),
        'aria-label': active ? labels.removeBreakpoint : labels.addBreakpoint,
      });
      const marker = el('span', { class: 'debugger-bp-marker', 'aria-hidden': 'true' }); marker.textContent = active ? '●' : '○';
      const address = el('span', { class: 'debugger-disasm-address' }); address.textContent = `${hex(seg, 4)}:${hex(line.addr, 8)}`;
      const bytes = el('span', { class: 'debugger-disasm-bytes' }); bytes.textContent = line.bytes.map((v) => hex(v, 2)).join(' ');
      const text = el('span', { class: 'debugger-disasm-text' }); text.textContent = line.text;
      row.append(marker, address, bytes, text);
      row.addEventListener('click', () => options.onToggleBreakpoint(seg, line.addr));
      root.append(row);
    }
  };
  return {
    update(state) { lastState = state; render(state); },
    setLabels(next) { labels = next; if (lastState) render(lastState); },
    destroy() { root.remove(); },
  };
}

export function mountMemoryDump(
  container: HTMLElement,
  options: {
    labels: MemoryDumpLabels;
    onRead(addr: number): Uint8Array;
    onError?(message: string): void;
  },
): MemoryDumpHandle {
  const input = el('input', {
    type: 'text', inputmode: 'text', value: '00000000', class: 'debugger-memory-address',
  }) as HTMLInputElement;
  const readButton = el('button', { type: 'button', class: 'debugger-memory-read' });
  const controls = el('div', { class: 'debugger-memory-controls' }); controls.append(input, readButton);
  const root = el('div', { class: 'debugger-memory-dump' }); container.append(controls, root);
  let labels = options.labels;
  const applyLabels = (): void => {
    input.setAttribute('aria-label', labels.address); readButton.textContent = labels.read;
  };
  const read = (): void => {
    const raw = input.value.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]+$/i.test(raw)) { options.onError?.(labels.invalidAddress); return; }
    const addr = Number.parseInt(raw, 16);
    try { handle.update(addr, options.onRead(addr)); }
    catch (error) { options.onError?.(error instanceof Error ? error.message : String(error)); }
  };
  readButton.addEventListener('click', read);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') read(); });
  const handle: MemoryDumpHandle = {
    update(addr, bytes) {
      root.replaceChildren();
      for (let offset = 0; offset < bytes.length; offset += 16) {
        const chunk = bytes.subarray(offset, offset + 16);
        const row = el('div', { class: 'debugger-memory-row' });
        const at = el('span', { class: 'debugger-memory-offset' }); at.textContent = hex(addr + offset, 8);
        const encoded = el('span', { class: 'debugger-memory-hex' }); encoded.textContent = Array.from(chunk, (v) => hex(v, 2)).join(' ');
        const ascii = el('span', { class: 'debugger-memory-ascii' });
        ascii.textContent = Array.from(chunk, (v) => v >= 0x20 && v <= 0x7e ? String.fromCharCode(v) : '.').join('');
        row.append(at, encoded, ascii); root.append(row);
      }
    },
    read,
    setEnabled(enabled) { readButton.disabled = !enabled; },
    setLabels(next) { labels = next; applyLabels(); },
    destroy() { controls.remove(); root.remove(); },
  };
  applyLabels();
  return handle;
}
