// プレイヤーUI (素のDOM構築)。canvas/オーバーレイ/ツールバー/進捗バー/D&D を組み立てる。

export const NATIVE_WIDTH = 640;
export const NATIVE_HEIGHT = 400;

export type DroppedKind = 'hdd' | 'fd';

export interface DroppedFile {
  kind: DroppedKind;
  file: File;
}

export interface PlayerCallbacks {
  onStart: () => void;
  onExportDisk: () => void;
  onResetToOriginal: () => void;
  onFullscreen: () => void;
  onFilesDropped: (files: DroppedFile[]) => void;
}

export interface PlayerUI {
  canvas: HTMLCanvasElement;
  setStatus(message: string, isError?: boolean): void;
  setProgress(label: string, ratio: number | null): void;
  hideProgress(): void;
  hideOverlay(): void;
  showOverlay(): void;
  setToolbarEnabled(enabled: boolean): void;
}

const HDD_EXTENSIONS = ['.thd', '.hdi', '.nhd', '.hdd'];
const FD_EXTENSIONS = ['.d88', '.fdi', '.xdf', '.dup', '.fdd', '.hdm'];

export function classifyDroppedFile(name: string): DroppedKind | null {
  const lower = name.toLowerCase();
  if (HDD_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'hdd';
  if (FD_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'fd';
  return null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

function rescale(canvas: HTMLCanvasElement, stage: HTMLElement): void {
  const maxWidth = Math.min(window.innerWidth - 32, 1280);
  const maxHeight = Math.min(window.innerHeight - 220, 960);
  const scale = Math.max(
    1,
    Math.floor(Math.min(maxWidth / NATIVE_WIDTH, maxHeight / NATIVE_HEIGHT)),
  );
  const w = NATIVE_WIDTH * scale;
  const h = NATIVE_HEIGHT * scale;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
}

export function buildPlayerUI(container: HTMLElement, callbacks: PlayerCallbacks): PlayerUI {
  const canvas = el('canvas', {
    id: 'canvas',
    width: String(NATIVE_WIDTH),
    height: String(NATIVE_HEIGHT),
    tabindex: '-1',
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const overlayNote = el('div', { class: 'overlay-note' }, [
    '音声再生の制限上、クリック操作で起動します。ファイルをドラッグ&ドロップして',
    'HDD/FDイメージを読み込むこともできます。',
  ]);
  const startBtn = el('button', { class: 'start-btn', type: 'button' }, ['クリックして起動']);
  const overlay = el('div', { class: 'overlay' }, [startBtn, overlayNote]);

  const stage = el('div', { class: 'stage' }, [canvas, overlay]);

  const btnExport = el('button', { type: 'button' }, ['ディスクをダウンロード']);
  const btnReset = el('button', { type: 'button' }, ['初期状態に戻す']);
  const btnFullscreen = el('button', { type: 'button' }, ['フルスクリーン']);
  const toolbar = el('div', { class: 'toolbar' }, [btnExport, btnReset, btnFullscreen]);

  const statusPanel = el('div', { class: 'status-panel' }, ['']);

  const progressLabel = el('div', { class: 'progress-label' }, ['']);
  const progressFill = el('div', { class: 'progress-bar-fill' });
  const progressTrack = el('div', { class: 'progress-bar-track' }, [progressFill]);
  const progressWrap = el('div', { class: 'progress-wrap' }, [progressLabel, progressTrack]);

  container.append(stage, progressWrap, toolbar, statusPanel);

  startBtn.addEventListener('click', () => callbacks.onStart());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) callbacks.onStart();
  });
  btnExport.addEventListener('click', () => callbacks.onExportDisk());
  btnReset.addEventListener('click', () => {
    if (confirm('現在の進行状況を破棄し、配布元の初期状態に戻します。よろしいですか？')) {
      callbacks.onResetToOriginal();
    }
  });
  btnFullscreen.addEventListener('click', () => callbacks.onFullscreen());

  // D&D
  let dragCounter = 0;
  stage.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  stage.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    stage.classList.add('dropzone-active');
  });
  stage.addEventListener('dragleave', () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) stage.classList.remove('dropzone-active');
  });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    stage.classList.remove('dropzone-active');
    const fileList = e.dataTransfer?.files;
    if (!fileList || fileList.length === 0) return;
    const dropped: DroppedFile[] = [];
    for (const file of Array.from(fileList)) {
      const kind = classifyDroppedFile(file.name);
      if (kind) {
        dropped.push({ kind, file });
      }
    }
    if (dropped.length === 0) {
      alert('対応していないファイル形式です（HDD: .thd/.hdi/.nhd/.hdd, FD: .d88/.fdi/.xdf/.dup 等）');
      return;
    }
    if (dropped.length > 1) {
      const names = dropped.map((d) => `${d.file.name} (${d.kind.toUpperCase()})`).join(', ');
      if (!confirm(`${dropped.length}件のファイルを読み込みます: ${names}\nよろしいですか？`)) {
        return;
      }
    }
    callbacks.onFilesDropped(dropped);
  });

  window.addEventListener('resize', () => rescale(canvas, stage));
  rescale(canvas, stage);

  const ui: PlayerUI = {
    canvas,
    setStatus(message: string, isError = false) {
      statusPanel.textContent = message;
      statusPanel.classList.toggle('error', isError);
    },
    setProgress(label: string, ratio: number | null) {
      progressWrap.classList.add('active');
      progressLabel.textContent = label;
      if (ratio === null) {
        progressFill.classList.add('indeterminate');
        progressFill.style.width = '';
      } else {
        progressFill.classList.remove('indeterminate');
        progressFill.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
      }
    },
    hideProgress() {
      progressWrap.classList.remove('active');
    },
    hideOverlay() {
      overlay.classList.add('hidden');
      canvas.focus();
    },
    showOverlay() {
      overlay.classList.remove('hidden');
    },
    setToolbarEnabled(enabled: boolean) {
      btnExport.disabled = !enabled;
      btnReset.disabled = !enabled;
    },
  };

  return ui;
}
