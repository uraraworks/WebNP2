// プレイヤーUI (素のDOM構築)。canvas/オーバーレイ/ツールバー/進捗バー/D&D を組み立てる。

import { getLang, setLang, t } from './strings.ts';
import type { DiskSlot } from '../api/webnp2.ts';

export const NATIVE_WIDTH = 640;
export const NATIVE_HEIGHT = 400;

export type DroppedKind = 'hdd' | 'fd';

export interface DroppedFile {
  kind: DroppedKind;
  file: File;
}

export interface PlayerCallbacks {
  onStart: () => void;
  /** オーバーレイの「FreeDOS(98) で起動」ボタン押下時（offerFreeDosChoice時のみ表示）。 */
  onStartFreeDos: () => void;
  onExportDisk: (slot: DiskSlot) => void;
  onResetToOriginal: () => void;
  onFullscreen: () => void;
  onFilesDropped: (files: DroppedFile[]) => void;
  /** 言語トグルボタン押下時。呼び出し側で setLang 済みの状態で呼ばれる。 */
  onLangChanged: () => void;
  onMachineReset: () => void;
  onScreenshot: () => void;
  onInsertFd: (drive: 1 | 2, file: File) => void;
  /** FDD1スロットの「FreeDOS(98) 挿入」ボタン押下時。同梱イメージをfetchして挿入する。 */
  onInsertFreeDos: () => void;
  onEjectFd: (drive: 1 | 2) => void;
  onCreateBlankFd: (drive: 1 | 2) => void;
  onSaveState: () => void;
  onLoadState: () => void;
}

export interface PlayerOptions {
  /** true: URLでディスク未指定のためオーバーレイに「そのまま起動」/「FreeDOS(98)で起動」の2択を出す。 */
  offerFreeDosChoice: boolean;
}

export interface PlayerUI {
  canvas: HTMLCanvasElement;
  setStatus(message: string, isError?: boolean): void;
  setProgress(label: string, ratio: number | null): void;
  hideProgress(): void;
  hideOverlay(): void;
  showOverlay(): void;
  setToolbarEnabled(enabled: boolean): void;
  /** FDD1/FDD2/HDDスロットの表示（マウント中ファイル名、無ければ空表示）を更新する。 */
  updateSlots(slots: { fd1?: string; fd2?: string; hdd?: string }): void;
  /** 自身が保持するUI要素（オーバーレイ・ツールバー等）の表示文言を現在の言語で再適用する。 */
  applyStrings(): void;
  /** WebMSX方式自動起動(run=1)でAudioContextがsuspended中に表示するミュート通知バナーを出す。 */
  showMuteBanner(): void;
  /** ミュート通知バナーをフェードアウトして隠す。 */
  hideMuteBanner(): void;
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

const ICON_SIZE = 20;

function svgIcon(pathD: string, extra = ''): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(ICON_SIZE));
  svg.setAttribute('height', String(ICON_SIZE));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="${pathD}"/>${extra}`;
  return svg;
}

const ICONS = {
  machineReset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  // 開いた箱(下側の三方枠)＋下向き矢印＝保存。loadStateと対になるデザイン。
  saveState: 'M6 10V19H18V10 M12 3v6 M9 6l3 3 3-3',
  // 開いた箱(下側の三方枠)＋上向き矢印＝復元。saveStateの上下対。
  loadState: 'M6 10V19H18V10 M12 9V3 M9 6l3-3 3 3',
  download: 'M12 3v12m0 0-4-4m4 4 4-4 M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  resetOriginal: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5 M11 8.5l4 3.5-4 3.5v-7z',
  fullscreen: 'M4 9V5a1 1 0 0 1 1-1h4 M15 4h4a1 1 0 0 1 1 1v4 M20 15v4a1 1 0 0 1-1 1h-4 M9 20H5a1 1 0 0 1-1-1v-4',
  // ディスクへ挿入＝バーの下に下向きの▼(ejectの上下反転)。
  insert: 'M12 19l6-8H6l6 8z M6 5h12',
  // 排出＝標準イジェクトアイコン(▲の下にバー)。insertと対になるデザイン。
  eject: 'M12 5l6 8H6l6-8z M6 19h12',
  blank: 'M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9l-6-6z M13 3v6h6 M12 12v6 M9 15h6',
  // OSディスクの意味合いを持たせたフロッピー風アイコン(ラベル窓+書込防止タブ)。title側で「FreeDOS(98)」と明示する。
  osDisk: 'M4 4h13l3 3v13H4z M4 4v6h12V4 M8 14h8v6H8z M17 4v4',
  // カメラ＝スクリーンショット。
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
};

function iconButton(icon: string, label: string, extraClass = ''): HTMLButtonElement {
  const btn = el('button', {
    type: 'button',
    class: extraClass ? `icon-btn ${extraClass}` : 'icon-btn',
    title: label,
    'aria-label': label,
  });
  btn.append(svgIcon(icon));
  return btn;
}

interface RescaleChrome {
  /** #app コンテナ。padding/gap の計測に使う。 */
  appEl: HTMLElement;
  /** ページ最上部の全幅ヘッダー（index.html 側の要素。存在しない場合もある）。 */
  pageHeader: HTMLElement | null;
  /** ページ最下部の全幅フッター（index.html 側の要素。存在しない場合もある）。 */
  pageFooter: HTMLElement | null;
  /** カード内のグレーのコンソールバー（ツールバー/FDスロット行）。 */
  footerBar: HTMLElement;
  statusPanel: HTMLElement;
  progressWrap: HTMLElement;
}

/**
 * キャンバスの整数倍スケールを決める。
 * 固定マジックナンバーではなく、実際に存在するページヘッダー/コンソールバー/
 * ページフッター/ステータス行/進捗バーの高さを動的に合計して差し引くことで、
 * 通常のウィンドウサイズで縦スクロール無しに全体が収まるようにする。
 */
function rescale(canvas: HTMLCanvasElement, stage: HTMLElement, card: HTMLElement, chrome: RescaleChrome): void {
  const maxWidth = Math.min(window.innerWidth - 32, 1280);

  const appStyle = getComputedStyle(chrome.appEl);
  const appPaddingV = parseFloat(appStyle.paddingTop) + parseFloat(appStyle.paddingBottom);
  const gap = parseFloat(appStyle.rowGap || appStyle.gap) || 0;

  const progressActive = chrome.progressWrap.classList.contains('active');
  // #app の子要素は card / progressWrap(非表示時はgap無し) / statusPanel の順。
  const visibleAppChildren = 2 + (progressActive ? 1 : 0);
  const gapsInApp = Math.max(0, visibleAppChildren - 1) * gap;

  const reservedHeight =
    (chrome.pageHeader?.getBoundingClientRect().height ?? 0) +
    (chrome.pageFooter?.getBoundingClientRect().height ?? 0) +
    chrome.footerBar.getBoundingClientRect().height +
    chrome.statusPanel.getBoundingClientRect().height +
    (progressActive ? chrome.progressWrap.getBoundingClientRect().height : 0) +
    appPaddingV +
    gapsInApp;

  // reservedHeight の再計測誤差やスクロールバー分の余白として少し余裕を持たせる。
  const maxHeight = Math.min(window.innerHeight - reservedHeight - 4, 960);
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
  card.style.width = `${w}px`;
}

export function buildPlayerUI(
  container: HTMLElement,
  callbacks: PlayerCallbacks,
  options: PlayerOptions,
): PlayerUI {
  const canvas = el('canvas', {
    id: 'canvas',
    width: String(NATIVE_WIDTH),
    height: String(NATIVE_HEIGHT),
    tabindex: '-1',
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const overlayNoteLine1 = el('span', {}, [t('overlayNote1')]);
  const overlayNoteLine2 = el('span', {}, [t('overlayNote2')]);
  const overlayNote = el('div', { class: 'overlay-note' }, [
    overlayNoteLine1,
    el('br'),
    overlayNoteLine2,
  ]);
  // ディスク未指定時は「そのまま起動」/「FreeDOS(98) で起動」の2択、指定時は従来の単一ボタン。
  const startBtn = el('button', { class: 'start-btn', type: 'button' }, [
    t(options.offerFreeDosChoice ? 'startBtnPlain' : 'startBtn'),
  ]);
  const freeDosBtn = options.offerFreeDosChoice
    ? el('button', { class: 'start-btn start-btn-freedos', type: 'button' }, [t('startBtnFreeDos')])
    : undefined;
  const overlayButtons = freeDosBtn
    ? el('div', { class: 'overlay-choices' }, [startBtn, freeDosBtn])
    : startBtn;
  const overlay = el('div', { class: 'overlay' }, [overlayButtons, overlayNote]);

  const muteBanner = el('div', { class: 'mute-banner hidden' }, [t('audioMuted')]);

  const stage = el('div', { class: 'stage' }, [canvas, overlay, muteBanner]);

  const btnMachineReset = iconButton(ICONS.machineReset, t('toolbarMachineReset'));
  const btnSaveState = iconButton(ICONS.saveState, t('toolbarSaveState'));
  const btnLoadState = iconButton(ICONS.loadState, t('toolbarLoadState'));
  const btnScreenshot = iconButton(ICONS.camera, t('toolbarScreenshot'));
  const btnReset = iconButton(ICONS.resetOriginal, t('toolbarReset'));
  const btnFullscreen = iconButton(ICONS.fullscreen, t('toolbarFullscreen'));
  const btnLang = el('button', { type: 'button', class: 'lang-toggle' }, [t('langToggle')]);
  const toolbar = el('div', { class: 'toolbar' }, [
    btnMachineReset,
    btnSaveState,
    btnLoadState,
    btnScreenshot,
    btnReset,
    btnFullscreen,
    btnLang,
  ]);

  // FDスロットUI (FDD1/FDD2)
  const fdLabel1 = el('span', { class: 'fd-label' }, [t('fdSlotLabel', { drive: 1 })]);
  const fdName1 = el('span', { class: 'fd-name' }, [t('fdEmpty')]);
  const fdInput1 = el('input', {
    type: 'file',
    class: 'fd-file-input',
    accept: '.d88,.fdi,.xdf,.dup,.fdd,.hdm',
  });
  const fdInsertBtn1 = iconButton(ICONS.insert, t('fdInsert'));
  const fdFreeDosBtn1 = iconButton(ICONS.osDisk, t('fdInsertFreeDos'));
  const fdEjectBtn1 = iconButton(ICONS.eject, t('fdEject'));
  const fdBlankBtn1 = iconButton(ICONS.blank, t('fdCreateBlank'));
  const fdDlBtn1 = iconButton(ICONS.download, t('slotDownload'));
  const fdSlot1 = el('div', { class: 'fd-slot' }, [
    fdLabel1,
    fdName1,
    fdInsertBtn1,
    fdInput1,
    fdFreeDosBtn1,
    fdEjectBtn1,
    fdBlankBtn1,
    fdDlBtn1,
  ]);

  const fdLabel2 = el('span', { class: 'fd-label' }, [t('fdSlotLabel', { drive: 2 })]);
  const fdName2 = el('span', { class: 'fd-name' }, [t('fdEmpty')]);
  const fdInput2 = el('input', {
    type: 'file',
    class: 'fd-file-input',
    accept: '.d88,.fdi,.xdf,.dup,.fdd,.hdm',
  });
  const fdInsertBtn2 = iconButton(ICONS.insert, t('fdInsert'));
  const fdEjectBtn2 = iconButton(ICONS.eject, t('fdEject'));
  const fdBlankBtn2 = iconButton(ICONS.blank, t('fdCreateBlank'));
  const fdDlBtn2 = iconButton(ICONS.download, t('slotDownload'));
  const fdSlot2 = el('div', { class: 'fd-slot' }, [
    fdLabel2,
    fdName2,
    fdInsertBtn2,
    fdInput2,
    fdEjectBtn2,
    fdBlankBtn2,
    fdDlBtn2,
  ]);

  // HDDスロットUI（コアが実行中のHDD挿抜に未対応のためDLボタンのみ）
  const hddLabel = el('span', { class: 'fd-label' }, [t('hddSlotLabel')]);
  const hddName = el('span', { class: 'fd-name' }, [t('fdEmpty')]);
  const hddDlBtn = iconButton(ICONS.download, t('slotDownload'));
  const hddSlot = el('div', { class: 'fd-slot' }, [hddLabel, hddName, hddDlBtn]);

  const fdSlots = el('div', { class: 'fd-slots' }, [fdSlot1, fdSlot2, hddSlot]);

  const statusPanel = el('div', { class: 'status-panel' }, ['']);

  const progressLabel = el('div', { class: 'progress-label' }, ['']);
  const progressFill = el('div', { class: 'progress-bar-fill' });
  const progressTrack = el('div', { class: 'progress-bar-track' }, [progressFill]);
  const progressWrap = el('div', { class: 'progress-wrap' }, [progressLabel, progressTrack]);

  // WebMSX風: カードは実行画面(キャンバス) + グレーのコンソールバー(ツールバー/FDスロット)のみ。
  // 黒いページヘッダー/グレーのページフッターは index.html 側の全幅要素として別に存在する。
  const footerBar = el('div', { class: 'console-footer' }, [toolbar, fdSlots]);
  const card = el('div', { class: 'console-card' });
  card.append(stage, footerBar);

  container.append(card, progressWrap, statusPanel);

  startBtn.addEventListener('click', () => callbacks.onStart());
  freeDosBtn?.addEventListener('click', () => callbacks.onStartFreeDos());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) callbacks.onStart();
  });
  btnMachineReset.addEventListener('click', () => callbacks.onMachineReset());
  btnScreenshot.addEventListener('click', () => callbacks.onScreenshot());
  btnSaveState.addEventListener('click', () => callbacks.onSaveState());
  btnLoadState.addEventListener('click', () => callbacks.onLoadState());
  btnReset.addEventListener('click', () => {
    if (confirm(t('resetConfirm'))) {
      callbacks.onResetToOriginal();
    }
  });
  btnFullscreen.addEventListener('click', () => callbacks.onFullscreen());
  btnLang.addEventListener('click', () => {
    setLang(getLang() === 'ja' ? 'en' : 'ja');
    ui.applyStrings();
    callbacks.onLangChanged();
  });

  fdInsertBtn1.addEventListener('click', () => fdInput1.click());
  fdInput1.addEventListener('change', () => {
    const file = fdInput1.files?.[0];
    fdInput1.value = '';
    if (file) callbacks.onInsertFd(1, file);
  });
  fdFreeDosBtn1.addEventListener('click', () => callbacks.onInsertFreeDos());
  fdEjectBtn1.addEventListener('click', () => callbacks.onEjectFd(1));
  fdBlankBtn1.addEventListener('click', () => callbacks.onCreateBlankFd(1));
  fdDlBtn1.addEventListener('click', () => callbacks.onExportDisk('fd1'));

  fdInsertBtn2.addEventListener('click', () => fdInput2.click());
  fdInput2.addEventListener('change', () => {
    const file = fdInput2.files?.[0];
    fdInput2.value = '';
    if (file) callbacks.onInsertFd(2, file);
  });
  fdEjectBtn2.addEventListener('click', () => callbacks.onEjectFd(2));
  fdBlankBtn2.addEventListener('click', () => callbacks.onCreateBlankFd(2));
  fdDlBtn2.addEventListener('click', () => callbacks.onExportDisk('fd2'));

  hddDlBtn.addEventListener('click', () => callbacks.onExportDisk('hdd'));

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
      alert(t('dropUnsupported'));
      return;
    }
    if (dropped.length > 1) {
      const names = dropped.map((d) => `${d.file.name} (${d.kind.toUpperCase()})`).join(', ');
      if (!confirm(t('dropConfirm', { count: dropped.length, names }))) {
        return;
      }
    }
    callbacks.onFilesDropped(dropped);
  });

  const rescaleChrome: RescaleChrome = {
    appEl: container,
    pageHeader: document.querySelector<HTMLElement>('header.app-header'),
    pageFooter: document.querySelector<HTMLElement>('footer.app-footer'),
    footerBar,
    statusPanel,
    progressWrap,
  };
  window.addEventListener('resize', () => rescale(canvas, stage, card, rescaleChrome));
  rescale(canvas, stage, card, rescaleChrome);

  // 即時+次フレーム+レイアウト沈静後の3回再計算する。スクロールバーの出没や
  // ステータス文の折り返しはクラス切替直後の計測に反映されないことがあるため。
  const scheduleRescale = (): void => {
    rescale(canvas, stage, card, rescaleChrome);
    requestAnimationFrame(() => rescale(canvas, stage, card, rescaleChrome));
    setTimeout(() => rescale(canvas, stage, card, rescaleChrome), 150);
  };

  // 進捗バーの出没やステータス文の折り返し、スクロールバーの出現などで
  // 「スケール計算時と表示時で空き寸法が食い違う」レースが起きるため、
  // 周辺クロームと documentElement のサイズ変化すべてに追従して再計算する。
  // rescale は同じ入力なら同じ結果に収束するのでループはしない。
  const chromeObserver = new ResizeObserver(() => rescale(canvas, stage, card, rescaleChrome));
  chromeObserver.observe(document.documentElement);
  chromeObserver.observe(statusPanel);
  chromeObserver.observe(progressWrap);
  chromeObserver.observe(footerBar);
  if (rescaleChrome.pageHeader) chromeObserver.observe(rescaleChrome.pageHeader);
  if (rescaleChrome.pageFooter) chromeObserver.observe(rescaleChrome.pageFooter);

  let toolbarEnabled = false;
  let slotMounted: { fd1?: string; fd2?: string; hdd?: string } = {};
  let muteBannerVisible = false;

  const ui: PlayerUI = {
    canvas,
    setStatus(message: string, isError = false) {
      statusPanel.textContent = message;
      statusPanel.classList.toggle('error', isError);
    },
    setProgress(label: string, ratio: number | null) {
      const wasActive = progressWrap.classList.contains('active');
      progressWrap.classList.add('active');
      if (!wasActive) scheduleRescale();
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
      const wasActive = progressWrap.classList.contains('active');
      progressWrap.classList.remove('active');
      if (wasActive) scheduleRescale();
    },
    hideOverlay() {
      overlay.classList.add('hidden');
      canvas.focus();
    },
    showOverlay() {
      overlay.classList.remove('hidden');
    },
    setToolbarEnabled(enabled: boolean) {
      toolbarEnabled = enabled;
      btnMachineReset.disabled = !enabled;
      btnScreenshot.disabled = !enabled;
      btnSaveState.disabled = !enabled;
      btnLoadState.disabled = !enabled;
      btnReset.disabled = !enabled;
      fdInsertBtn1.disabled = !enabled;
      fdFreeDosBtn1.disabled = !enabled;
      fdBlankBtn1.disabled = !enabled;
      fdInsertBtn2.disabled = !enabled;
      fdBlankBtn2.disabled = !enabled;
      fdEjectBtn1.disabled = !enabled || !slotMounted.fd1;
      fdEjectBtn2.disabled = !enabled || !slotMounted.fd2;
      fdDlBtn1.disabled = !enabled || !slotMounted.fd1;
      fdDlBtn2.disabled = !enabled || !slotMounted.fd2;
      hddDlBtn.disabled = !enabled || !slotMounted.hdd;
    },
    updateSlots(slots: { fd1?: string; fd2?: string; hdd?: string }) {
      slotMounted = slots;
      fdName1.textContent = slots.fd1 ?? t('fdEmpty');
      fdName2.textContent = slots.fd2 ?? t('fdEmpty');
      hddName.textContent = slots.hdd ?? t('fdEmpty');
      fdEjectBtn1.disabled = !toolbarEnabled || !slots.fd1;
      fdEjectBtn2.disabled = !toolbarEnabled || !slots.fd2;
      fdDlBtn1.disabled = !toolbarEnabled || !slots.fd1;
      fdDlBtn2.disabled = !toolbarEnabled || !slots.fd2;
      hddDlBtn.disabled = !toolbarEnabled || !slots.hdd;
    },
    applyStrings() {
      overlayNoteLine1.textContent = t('overlayNote1');
      overlayNoteLine2.textContent = t('overlayNote2');
      startBtn.textContent = t(options.offerFreeDosChoice ? 'startBtnPlain' : 'startBtn');
      if (freeDosBtn) freeDosBtn.textContent = t('startBtnFreeDos');
      btnMachineReset.title = t('toolbarMachineReset');
      btnMachineReset.setAttribute('aria-label', t('toolbarMachineReset'));
      btnSaveState.title = t('toolbarSaveState');
      btnSaveState.setAttribute('aria-label', t('toolbarSaveState'));
      btnLoadState.title = t('toolbarLoadState');
      btnLoadState.setAttribute('aria-label', t('toolbarLoadState'));
      btnScreenshot.title = t('toolbarScreenshot');
      btnScreenshot.setAttribute('aria-label', t('toolbarScreenshot'));
      btnReset.title = t('toolbarReset');
      btnReset.setAttribute('aria-label', t('toolbarReset'));
      btnFullscreen.title = t('toolbarFullscreen');
      btnFullscreen.setAttribute('aria-label', t('toolbarFullscreen'));
      btnLang.textContent = t('langToggle');
      fdLabel1.textContent = t('fdSlotLabel', { drive: 1 });
      fdLabel2.textContent = t('fdSlotLabel', { drive: 2 });
      hddLabel.textContent = t('hddSlotLabel');
      fdName1.textContent = slotMounted.fd1 ?? t('fdEmpty');
      fdName2.textContent = slotMounted.fd2 ?? t('fdEmpty');
      hddName.textContent = slotMounted.hdd ?? t('fdEmpty');
      fdInsertBtn1.title = t('fdInsert');
      fdInsertBtn1.setAttribute('aria-label', t('fdInsert'));
      fdFreeDosBtn1.title = t('fdInsertFreeDos');
      fdFreeDosBtn1.setAttribute('aria-label', t('fdInsertFreeDos'));
      fdInsertBtn2.title = t('fdInsert');
      fdInsertBtn2.setAttribute('aria-label', t('fdInsert'));
      fdEjectBtn1.title = t('fdEject');
      fdEjectBtn1.setAttribute('aria-label', t('fdEject'));
      fdEjectBtn2.title = t('fdEject');
      fdEjectBtn2.setAttribute('aria-label', t('fdEject'));
      fdBlankBtn1.title = t('fdCreateBlank');
      fdBlankBtn1.setAttribute('aria-label', t('fdCreateBlank'));
      fdBlankBtn2.title = t('fdCreateBlank');
      fdBlankBtn2.setAttribute('aria-label', t('fdCreateBlank'));
      fdDlBtn1.title = t('slotDownload');
      fdDlBtn1.setAttribute('aria-label', t('slotDownload'));
      fdDlBtn2.title = t('slotDownload');
      fdDlBtn2.setAttribute('aria-label', t('slotDownload'));
      hddDlBtn.title = t('slotDownload');
      hddDlBtn.setAttribute('aria-label', t('slotDownload'));
      muteBanner.textContent = t('audioMuted');
    },
    showMuteBanner() {
      if (muteBannerVisible) return;
      muteBannerVisible = true;
      muteBanner.textContent = t('audioMuted');
      muteBanner.classList.remove('hidden');
      // 'hidden' 解除直後に 'show' を付けないと display:none → opacity 遷移が発火しないため1フレーム待つ。
      void muteBanner.offsetWidth;
      muteBanner.classList.add('show');
    },
    hideMuteBanner() {
      if (!muteBannerVisible) return;
      muteBannerVisible = false;
      muteBanner.classList.remove('show');
      const onEnd = (): void => {
        muteBanner.classList.add('hidden');
        muteBanner.removeEventListener('transitionend', onEnd);
      };
      muteBanner.addEventListener('transitionend', onEnd);
    },
  };

  return ui;
}
