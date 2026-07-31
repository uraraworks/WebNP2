import './ui/styles.css';
import { buildPlayerUI, type DroppedFile, type PlayerUI } from './ui/player.ts';
import { WebNP2, type DiskSlot } from './api/webnp2.ts';
import * as db from './storage/db.ts';
import type { DiskFile } from './core/module.ts';

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
// clk は Phase 2 で使用予定。現時点では受け取るだけ。
const clkParam = params.get('clk') ?? undefined;
void clkParam;
void runParam;

const app = document.getElementById('app');
if (!app) {
  throw new Error('#app not found');
}

let ui: PlayerUI;
let np2: WebNP2;
let bootStarted = false;

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
    throw new Error(
      `イメージの取得に失敗しました（ネットワークエラーまたはCORS設定を確認してください）: ${url}`,
    );
  }
  if (!response.ok) {
    throw new Error(`イメージの取得に失敗しました（HTTP ${response.status}）: ${url}`);
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
    ui.setStatus(`${label}: 前回の続きから再開中です（${stored.name}）`);
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
  ui.setProgress(`${label} を取得中: ${name}`, total_ratio(0, null));
  const bytes = await fetchWithProgress(url, (loaded, total) => {
    ui.setProgress(
      `${label} を取得中: ${name} (${formatBytes(loaded)}${total ? ' / ' + formatBytes(total) : ''})`,
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
  ui.setStatus('起動準備中…');

  try {
    const images = await loadAllImages();
    ui.hideProgress();

    if (!images.hdd && !images.fd1 && !images.fd2) {
      ui.setStatus('イメージが指定されていません。ファイルをドラッグ&ドロップして読み込んでください。');
    } else {
      ui.setStatus('コアを起動しています…');
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
    });

    ui.setStatus('起動しました。');
    ui.setToolbarEnabled(true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ui.setStatus(`起動に失敗しました: ${message}`, true);
    ui.hideProgress();
    ui.showOverlay();
    bootStarted = false;
  }
}

async function handleDroppedFiles(files: DroppedFile[]): Promise<void> {
  if (bootStarted) {
    alert('起動後のディスク差し替えは Phase 2 で対応予定です。ページを再読み込みしてください。');
    return;
  }

  let hdd: PendingImage | undefined;
  const fds: PendingImage[] = [];

  for (const dropped of files) {
    const buf = new Uint8Array(await dropped.file.arrayBuffer());
    const sourceKey = fileKeyFor(dropped.file.name, dropped.file.size);
    const pending: PendingImage = {
      slot: dropped.kind === 'hdd' ? 'hdd' : fds.length === 0 ? 'fd1' : 'fd2',
      name: dropped.file.name,
      sourceKey,
      bytes: buf,
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
  ui.setStatus('コアを起動しています…');
  try {
    await np2.boot({
      hdd: hdd ? { file: toDiskFile(hdd), sourceKey: hdd.sourceKey } : undefined,
      fd1: fds[0] ? { file: toDiskFile(fds[0]), sourceKey: fds[0].sourceKey } : undefined,
      fd2: fds[1] ? { file: toDiskFile(fds[1]), sourceKey: fds[1].sourceKey } : undefined,
    });
    ui.setStatus('起動しました。');
    ui.setToolbarEnabled(true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ui.setStatus(`起動に失敗しました: ${message}`, true);
    ui.showOverlay();
    bootStarted = false;
  }
}

function init(): void {
  ui = buildPlayerUI(app!, {
    onStart: () => void doBoot(),
    onExportDisk: () => void chooseAndExport(),
    onResetToOriginal: () => void chooseAndReset(),
    onFullscreen: () => void np2.fullscreen(),
    onFilesDropped: (files) => void handleDroppedFiles(files),
  });
  np2 = new WebNP2(ui.canvas);
  np2.on('log', ({ level, message }) => {
    if (level === 'error') console.error('[WebNP2]', message);
    else console.log('[WebNP2]', message);
  });
  ui.setToolbarEnabled(false);

  window.addEventListener('error', (e) => {
    console.error('[WebNP2] uncaught error', e.error ?? e.message);
  });
}

async function chooseAndExport(): Promise<void> {
  const slots = np2.getMountedImages();
  if (slots.length === 0) {
    alert('マウント中のイメージがありません。');
    return;
  }
  const target = slots.length === 1 ? slots[0].slot : await pickSlot(slots.map((s) => s.slot), 'ダウンロードする');
  if (!target) return;
  await np2.exportDisk(target);
}

async function chooseAndReset(): Promise<void> {
  const slots = np2.getMountedImages();
  if (slots.length === 0) {
    alert('マウント中のイメージがありません。');
    return;
  }
  const target = slots.length === 1 ? slots[0].slot : await pickSlot(slots.map((s) => s.slot), '初期状態に戻す');
  if (!target) return;
  await np2.resetToOriginal(target);
}

async function pickSlot(slots: DiskSlot[], actionLabel: string): Promise<DiskSlot | undefined> {
  const input = prompt(`${actionLabel}対象を選択してください: ${slots.join(', ')}`, slots[0]);
  if (!input) return undefined;
  return slots.includes(input as DiskSlot) ? (input as DiskSlot) : undefined;
}

init();
