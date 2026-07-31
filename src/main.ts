import './ui/styles.css';
import { buildPlayerUI, type DroppedFile, type PlayerUI } from './ui/player.ts';
import { WebNP2, type DiskSlot } from './api/webnp2.ts';
import * as db from './storage/db.ts';
import type { DiskFile } from './core/module.ts';
import { getLang, t, type StringKey } from './ui/strings.ts';

interface PendingImage {
  slot: DiskSlot;
  name: string;
  sourceKey: string;
  url?: string;
  bytes: Uint8Array;
  resumed: boolean;
}

const params = new URLSearchParams(location.search);
const hddUrl = params.get('hdd') ?? undefined;
const fd1Url = params.get('fd1') ?? undefined;
const fd2Url = params.get('fd2') ?? undefined;
const runParam = params.get('run') === '1';
// 拡張メモリ(MB)。DOS用途では1MBで十分なので既定は1。?mem=N で変更可能。
const memParamRaw = Number(params.get('mem') ?? '');
const memParam = Number.isFinite(memParamRaw) && params.get('mem') !== null ? memParamRaw : undefined;
// clk はCPUクロック倍率(1〜32)。core/module.ts の buildCfg でクランプする。
const clkParamRaw = Number(params.get('clk') ?? '');
const clkParam = Number.isFinite(clkParamRaw) && params.get('clk') !== null ? clkParamRaw : undefined;
void runParam;

const app = document.getElementById('app');
if (!app) {
  throw new Error('#app not found');
}

let ui: PlayerUI;
let np2: WebNP2;
let bootStarted = false;

// ステータス行は最後に表示したメッセージを key+args で保持し、言語切替時に再適用する。
let lastStatus: { key: StringKey; args: unknown[]; isError: boolean } | null = null;

function setStatusT(key: StringKey, args: unknown[] = [], isError = false): void {
  lastStatus = { key, args, isError };
  ui.setStatus((t as (k: StringKey, ...a: unknown[]) => string)(key, ...args), isError);
}

function applyDocumentStrings(): void {
  document.title = t('title');
  document.documentElement.lang = getLang();
  const footer = document.querySelector<HTMLElement>('.app-footer');
  if (footer) footer.textContent = t('footerLicense');
}

function fileKeyFor(name: string, size: number): string {
  return `file:${name}:${size}`;
}

async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(t('fetchFailedNetwork', { url }));
  }
  if (!response.ok) {
    throw new Error(t('fetchFailedHttp', { url, status: response.status }));
  }
  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : null;

  if (!response.body) {
    const buf = await response.arrayBuffer();
    onProgress(buf.byteLength, total);
    return new Uint8Array(buf);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  }
  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function resolveImage(
  slot: DiskSlot,
  url: string | undefined,
  label: string,
): Promise<PendingImage | undefined> {
  if (!url) return undefined;

  const sourceKey = url;
  const stored = await db.get(sourceKey);
  if (stored) {
    setStatusT('statusResumed', [{ label, name: stored.name }]);
    return {
      slot,
      name: stored.name,
      sourceKey,
      url,
      bytes: new Uint8Array(stored.bytes),
      resumed: true,
    };
  }

  const name = decodeURIComponent(url.split('/').pop() || `${slot}.img`);
  ui.setProgress(t('statusFetching', { label, name }), total_ratio(0, null));
  const bytes = await fetchWithProgress(url, (loaded, total) => {
    ui.setProgress(
      t('statusFetchingProgress', {
        label,
        name,
        loaded: formatBytes(loaded),
        total: total ? formatBytes(total) : null,
      }),
      total ? loaded / total : null,
    );
  });
  return { slot, name, sourceKey, url, bytes, resumed: false };
}

function total_ratio(loaded: number, total: number | null): number | null {
  return total ? loaded / total : null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function toDiskFile(img: PendingImage): DiskFile {
  return { name: img.name, bytes: img.bytes };
}

async function loadAllImages(): Promise<{
  hdd?: PendingImage;
  fd1?: PendingImage;
  fd2?: PendingImage;
}> {
  const hdd = await resolveImage('hdd', hddUrl, 'HDD');
  const fd1 = await resolveImage('fd1', fd1Url, 'FD1');
  const fd2 = await resolveImage('fd2', fd2Url, 'FD2');
  return { hdd, fd1, fd2 };
}

async function doBoot(): Promise<void> {
  if (bootStarted) return;
  bootStarted = true;
  ui.hideOverlay();
  setStatusT('statusPreparing');

  try {
    const images = await loadAllImages();
    ui.hideProgress();

    if (!images.hdd && !images.fd1 && !images.fd2) {
      setStatusT('statusNoImage');
    } else {
      setStatusT('statusCoreBooting');
    }

    await np2.boot({
      hdd: images.hdd
        ? { file: toDiskFile(images.hdd), sourceKey: images.hdd.sourceKey, url: images.hdd.url }
        : undefined,
      fd1: images.fd1
        ? { file: toDiskFile(images.fd1), sourceKey: images.fd1.sourceKey, url: images.fd1.url }
        : undefined,
      fd2: images.fd2
        ? { file: toDiskFile(images.fd2), sourceKey: images.fd2.sourceKey, url: images.fd2.url }
        : undefined,
      extMemMB: memParam,
      clkMult: clkParam,
    });

    setStatusT('statusBootSuccess');
    ui.setToolbarEnabled(true);
    updateFdSlotsUI();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatusT('statusBootFailed', [{ message }], true);
    ui.hideProgress();
    ui.showOverlay();
    bootStarted = false;
  }
}

/** File を DiskFile + sourceKey に変換する（D&D・FD挿入UIの両方から使う共通経路）。 */
async function fileToDiskFileAndKey(file: File): Promise<{ diskFile: DiskFile; sourceKey: string }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const sourceKey = fileKeyFor(file.name, file.size);
  return { diskFile: { name: file.name, bytes: buf }, sourceKey };
}

async function handleDroppedFiles(files: DroppedFile[]): Promise<void> {
  if (bootStarted) {
    alert(t('diskReplaceUnsupported'));
    return;
  }

  let hdd: PendingImage | undefined;
  const fds: PendingImage[] = [];

  for (const dropped of files) {
    const { diskFile, sourceKey } = await fileToDiskFileAndKey(dropped.file);
    const pending: PendingImage = {
      slot: dropped.kind === 'hdd' ? 'hdd' : fds.length === 0 ? 'fd1' : 'fd2',
      name: diskFile.name,
      sourceKey,
      bytes: diskFile.bytes,
      resumed: false,
    };
    if (dropped.kind === 'hdd') {
      hdd = pending;
    } else if (fds.length < 2) {
      fds.push(pending);
    }
  }

  bootStarted = true;
  ui.hideOverlay();
  setStatusT('statusCoreBooting');
  try {
    await np2.boot({
      hdd: hdd ? { file: toDiskFile(hdd), sourceKey: hdd.sourceKey } : undefined,
      fd1: fds[0] ? { file: toDiskFile(fds[0]), sourceKey: fds[0].sourceKey } : undefined,
      fd2: fds[1] ? { file: toDiskFile(fds[1]), sourceKey: fds[1].sourceKey } : undefined,
      extMemMB: memParam,
      clkMult: clkParam,
    });
    setStatusT('statusBootSuccess');
    ui.setToolbarEnabled(true);
    updateFdSlotsUI();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatusT('statusBootFailed', [{ message }], true);
    ui.showOverlay();
    bootStarted = false;
  }
}

function updateFdSlotsUI(): void {
  const mounted = np2.getMountedImages();
  ui.updateSlots({
    fd1: mounted.find((m) => m.slot === 'fd1')?.name,
    fd2: mounted.find((m) => m.slot === 'fd2')?.name,
    hdd: mounted.find((m) => m.slot === 'hdd')?.name,
  });
}

async function handleInsertFd(drive: 1 | 2, file: File): Promise<void> {
  try {
    const { diskFile, sourceKey } = await fileToDiskFileAndKey(file);
    await np2.insertFd(drive, diskFile, sourceKey);
    updateFdSlotsUI();
    setStatusT('statusFdInserted', [{ drive, name: diskFile.name }]);
  } catch (err) {
    setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
  }
}

async function handleEjectFd(drive: 1 | 2): Promise<void> {
  try {
    await np2.ejectFd(drive);
    updateFdSlotsUI();
    setStatusT('statusFdEjected', [{ drive }]);
  } catch (err) {
    setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
  }
}

async function handleCreateBlankFd(drive: 1 | 2): Promise<void> {
  try {
    const blank = np2.createBlankFd();
    await np2.insertFd(drive, blank, fileKeyFor(blank.name, blank.bytes.length));
    updateFdSlotsUI();
    setStatusT('statusFdInserted', [{ drive, name: blank.name }]);
  } catch (err) {
    setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
  }
}

function init(): void {
  applyDocumentStrings();
  ui = buildPlayerUI(app!, {
    onStart: () => void doBoot(),
    onExportDisk: (slot) => void np2.exportDisk(slot),
    onResetToOriginal: () => void chooseAndReset(),
    onFullscreen: () => void np2.fullscreen(),
    onFilesDropped: (files) => void handleDroppedFiles(files),
    onLangChanged: () => {
      applyDocumentStrings();
      if (lastStatus) {
        ui.setStatus(
          (t as (k: StringKey, ...a: unknown[]) => string)(lastStatus.key, ...lastStatus.args),
          lastStatus.isError,
        );
      }
    },
    onMachineReset: () => {
      try {
        np2.resetMachine();
        setStatusT('statusMachineReset');
      } catch (err) {
        setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
      }
    },
    onInsertFd: (drive, file) => void handleInsertFd(drive, file),
    onEjectFd: (drive) => void handleEjectFd(drive),
    onCreateBlankFd: (drive) => void handleCreateBlankFd(drive),
    onSaveState: () => void np2.saveState(),
    onLoadState: () => void np2.loadState(),
  });
  np2 = new WebNP2(ui.canvas);
  np2.on('log', ({ level, message }) => {
    if (level === 'error') console.error('[WebNP2]', message);
    else console.log('[WebNP2]', message);
  });
  np2.on('fdChanged', () => updateFdSlotsUI());
  np2.on('stateSaved', () => setStatusT('statusStateSaved'));
  np2.on('stateLoaded', () => setStatusT('statusStateLoaded'));
  ui.setToolbarEnabled(false);

  window.addEventListener('error', (e) => {
    console.error('[WebNP2] uncaught error', e.error ?? e.message);
  });
}

async function chooseAndReset(): Promise<void> {
  const slots = np2.getMountedImages();
  if (slots.length === 0) {
    alert(t('noMountedImage'));
    return;
  }
  const target =
    slots.length === 1 ? slots[0].slot : await pickSlot(slots.map((s) => s.slot), t('pickSlotActionReset'));
  if (!target) return;
  await np2.resetToOriginal(target);
}

async function pickSlot(slots: DiskSlot[], actionLabel: string): Promise<DiskSlot | undefined> {
  const input = prompt(t('pickSlotPrompt', { action: actionLabel, slots: slots.join(', ') }), slots[0]);
  if (!input) return undefined;
  return slots.includes(input as DiskSlot) ? (input as DiskSlot) : undefined;
}

init();
