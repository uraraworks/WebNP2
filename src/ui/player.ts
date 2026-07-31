// プレイヤーUI (素のDOM構築)。canvas/オーバーレイ/ツールバー/進捗バー/D&D を組み立てる。

import { getLang, setLang, t } from './strings.ts';
import type { DiskSlot } from '../api/webnp2.ts';
import type { RomEntry } from '../api/roms.ts';

/** ディスクライブラリ(IndexedDB保存済みHDD/FD)の一覧に表示する1件。 */
export interface LibraryEntry {
  sourceKey: string;
  name: string;
  size: number;
  savedAt: number;
  kind: 'hdd' | 'fd';
}

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
  onMouseToggle: () => void;
  onInsertFd: (drive: 1 | 2, file: File) => void;
  /** FDD1スロットの「FreeDOS(98) 挿入」ボタン押下時。同梱イメージをfetchして挿入する。 */
  onInsertFreeDos: () => void;
  onEjectFd: (drive: 1 | 2) => void;
  onCreateBlankFd: (drive: 1 | 2) => void;
  onSaveState: () => void;
  onLoadState: () => void;
  /** テキスト送信バーからの送信。checkbox ONなら末尾に'\n'を含めた文字列が渡される。 */
  onPasteText: (text: string) => void;
  /** ROM登録ダイアログの一覧取得。 */
  onListRoms: () => Promise<RomEntry[]>;
  /** ROM登録ダイアログのファイル選択時。 */
  onSaveRomFiles: (files: File[]) => Promise<{ saved: string[]; skipped: string[] }>;
  /** ROM登録ダイアログの削除ボタン押下時。 */
  onDeleteRom: (name: string) => Promise<void>;
  /** ディスクライブラリダイアログの一覧取得。 */
  onListLibrary: () => Promise<LibraryEntry[]>;
  /** ディスクライブラリから起動（HDDは'hdd'として、FDはFD1として起動）。呼び出し後モーダルは閉じられる。 */
  onLibraryBoot: (sourceKey: string) => Promise<void>;
  /** 実行中にディスクライブラリのFDイメージをFD1/FD2へ挿入する。 */
  onLibraryInsertFd: (drive: 1 | 2, sourceKey: string) => Promise<void>;
  /** ディスクライブラリのエントリ削除。 */
  onLibraryDelete: (sourceKey: string) => Promise<void>;
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
  /** テキスト送信機能の表示/非表示。全角が有効な環境(FreeDOS(98)等)のときだけ表示する。 */
  setPasteFeatureEnabled(enabled: boolean): void;
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
  // マウス(本体+ホイール線)＝マウスキャプチャ。
  mouse: 'M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6z M12 3v7 M12 7v3',
  // ICチップ風(四角+ピン)＝ROM/素材ファイル登録。
  rom: 'M7 7h10v10H7z M9 9h6v6H9z M7 4v3 M12 4v3 M17 4v3 M7 17v3 M12 17v3 M17 17v3 M4 7h3 M4 12h3 M4 17h3 M17 7h3 M17 12h3 M17 17h3',
  // 積み重なったディスク(FD角落とし2枚)＝ディスクライブラリ。
  library: 'M4 16h13l3-3V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1z M4 20h13a3 3 0 0 0 3-3 M8 9h6v4H8z',
  // 吹き出し(チャット風)＝ホスト側テキスト送信。
  pasteText: 'M4 5h16v11H8l-4 4V5z M7 9h10 M7 12h6',
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
  // ライブラリが空の場合もあるため既定は非表示。起動可否は非同期チェック後に表示する。
  const libraryStartBtn = el('button', { class: 'start-btn start-btn-library hidden', type: 'button' }, [
    t('overlayLibraryBtn'),
  ]);
  const overlayButtonList: HTMLElement[] = [startBtn];
  if (freeDosBtn) overlayButtonList.push(freeDosBtn);
  overlayButtonList.push(libraryStartBtn);
  const overlayButtons = el('div', { class: 'overlay-choices' }, overlayButtonList);
  const overlay = el('div', { class: 'overlay' }, [overlayButtons, overlayNote]);

  const muteBanner = el('div', { class: 'mute-banner hidden' }, [t('audioMuted')]);

  const stage = el('div', { class: 'stage' }, [canvas, overlay, muteBanner]);

  const btnMachineReset = iconButton(ICONS.machineReset, t('toolbarMachineReset'));
  const btnSaveState = iconButton(ICONS.saveState, t('toolbarSaveState'));
  const btnLoadState = iconButton(ICONS.loadState, t('toolbarLoadState'));
  const btnScreenshot = iconButton(ICONS.camera, t('toolbarScreenshot'));
  const btnMouse = iconButton(ICONS.mouse, t('toolbarMouse'));
  const btnReset = iconButton(ICONS.resetOriginal, t('toolbarReset'));
  const btnFullscreen = iconButton(ICONS.fullscreen, t('toolbarFullscreen'));
  const btnLang = el('button', { type: 'button', class: 'lang-toggle' }, [t('langToggle')]);
  // ROM登録は起動前でも次回起動設定として使うため、setToolbarEnabledの無効化対象にはしない。
  const btnRomManager = iconButton(ICONS.rom, t('toolbarRomManager'));
  // ディスクライブラリも起動前(起動選択)・起動後(FD挿入)どちらでも使うため常に有効。
  const btnDiskLibrary = iconButton(ICONS.library, t('toolbarDiskLibrary'));
  // テキスト送信は起動済みでないとキーバッファへ積めないため setToolbarEnabled 連動。
  const btnPasteText = iconButton(ICONS.pasteText, t('toolbarPasteText'));
  const toolbar = el('div', { class: 'toolbar' }, [
    btnMachineReset,
    btnSaveState,
    btnLoadState,
    btnScreenshot,
    btnMouse,
    btnReset,
    btnFullscreen,
    btnPasteText,
    btnRomManager,
    btnDiskLibrary,
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

  // FDD1/FDD2スロット行へのD&Dで該当ドライブに直接挿入する(挿入ボタンのドロップ版)。
  const wireSlotDrop = (slotEl: HTMLElement, drive: 1 | 2): void => {
    let depth = 0;
    slotEl.addEventListener('dragover', (e) => e.preventDefault());
    slotEl.addEventListener('dragenter', (e) => {
      e.preventDefault();
      depth++;
      slotEl.classList.add('dropzone-active');
    });
    slotEl.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) slotEl.classList.remove('dropzone-active');
    });
    slotEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      slotEl.classList.remove('dropzone-active');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (classifyDroppedFile(file.name) !== 'fd') {
        alert(t('dropUnsupported'));
        return;
      }
      if (!toolbarEnabled) {
        alert(t('slotDropNotBooted'));
        return;
      }
      callbacks.onInsertFd(drive, file);
    });
  };
  wireSlotDrop(fdSlot1, 1);
  wireSlotDrop(fdSlot2, 2);

  // ドロップゾーン外(HDDスロットやページ余白)に落としたとき、ブラウザが
  // ファイルを開いてページ遷移してしまう既定動作を抑止する。
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  // テキスト送信バー(チャット風)。全角対応(SJISキーバッファ直接注入)でホスト側からテキストを送る。
  const pasteInput = el('input', {
    type: 'text',
    class: 'paste-bar-input',
    placeholder: t('pasteBarPlaceholder'),
  }) as HTMLInputElement;
  const pasteEnterCheckbox = el('input', { type: 'checkbox', class: 'paste-bar-enter-checkbox' }) as HTMLInputElement;
  pasteEnterCheckbox.checked = false;
  const pasteEnterLabelText = el('span', {}, [t('pasteBarEnterLabel')]);
  const pasteEnterLabel = el('label', { class: 'paste-bar-enter-label' }, [
    pasteEnterCheckbox,
    pasteEnterLabelText,
  ]);
  const pasteSendBtn = el('button', { type: 'button', class: 'paste-bar-send-btn' }, [t('pasteBarSend')]);
  const pasteCloseBtn = el('button', { type: 'button', class: 'paste-bar-close-btn' }, [t('pasteBarClose')]);
  const pasteBar = el('div', { class: 'paste-bar hidden' }, [
    pasteInput,
    pasteEnterLabel,
    pasteSendBtn,
    pasteCloseBtn,
  ]);

  // ゲスト(SDL)側へキー入力が漏れてゲーム操作等を誤爆させないよう、入力欄内のキーイベントは
  // window側リスナーへ伝播させない。
  for (const eventName of ['keydown', 'keyup', 'keypress'] as const) {
    pasteInput.addEventListener(eventName, (e) => e.stopPropagation());
  }

  const sendPasteText = (): void => {
    const text = pasteInput.value + (pasteEnterCheckbox.checked ? '\n' : '');
    if (text.length === 0) return;
    callbacks.onPasteText(text);
    pasteInput.value = '';
    pasteInput.focus();
  };
  // バーはstage内の絶対配置オーバーレイ(レイアウト高さに影響させず、開閉で画面が縮まないように)。
  stage.append(pasteBar);

  // テキスト送信機能は既定で非表示。全角が届く環境(同梱FreeDOS(98)等)や
  // ?paste=1 のときだけ setPasteFeatureEnabled(true) で表示される。
  let pasteFeatureEnabled = false;
  btnPasteText.style.display = 'none';

  const openPasteBar = (): void => {
    pasteBar.classList.remove('hidden');
    pasteInput.focus();
  };
  const closePasteBar = (): void => {
    pasteBar.classList.add('hidden');
    pasteInput.blur();
  };
  pasteInput.addEventListener('keydown', (e) => {
    // IME変換確定のEnter(isComposing/keyCode 229)では送信しない。
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      sendPasteText();
    } else if (e.key === 'Escape' && !e.isComposing) {
      e.preventDefault();
      closePasteBar();
    }
  });
  pasteSendBtn.addEventListener('click', () => sendPasteText());
  pasteCloseBtn.addEventListener('click', () => closePasteBar());
  btnPasteText.addEventListener('click', () => {
    if (pasteBar.classList.contains('hidden')) openPasteBar();
    else closePasteBar();
  });
  // Shiftキー2回押し(500ms以内、間に他のキーなし)でテキスト送信バーを開く。
  // Shift単独のmake/breakはゲスト側でも無害なのでショートカットとして安全。
  let lastShiftDownAt = 0;
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Shift') {
      const now = performance.now();
      if (now - lastShiftDownAt < 500 && pasteFeatureEnabled && toolbarEnabled && pasteBar.classList.contains('hidden')) {
        lastShiftDownAt = 0;
        openPasteBar();
        return;
      }
      lastShiftDownAt = now;
    } else {
      lastShiftDownAt = 0;
    }
  });

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

  // ROM登録ダイアログ (起動前後どちらでも操作可能なグローバルモーダル)。
  const romDescription = el('p', { class: 'rom-modal-description' }, [t('romDialogDescription')]);
  const romFileInput = el('input', { type: 'file', class: 'rom-file-input', multiple: 'true' });
  const romSelectBtn = el('button', { type: 'button', class: 'rom-select-btn' }, [t('romDialogSelectFiles')]);
  const romStatus = el('div', { class: 'rom-modal-status' });
  const romList = el('div', { class: 'rom-list' });
  const romReloadNote = el('p', { class: 'rom-modal-reload-note' }, [t('romDialogReloadNote')]);
  const romReloadBtn = el('button', { type: 'button', class: 'rom-reload-btn' }, [t('romDialogReloadBtn')]);
  const romCloseBtn = el('button', { type: 'button', class: 'rom-close-btn' }, [t('romDialogClose')]);
  const romTitle = el('h2', { class: 'rom-modal-title' }, [t('romDialogTitle')]);
  const romDropHint = el('p', { class: 'rom-modal-drop-hint' }, [t('romDialogDropHint')]);
  const romModal = el('div', { class: 'rom-modal', role: 'dialog', 'aria-modal': 'true' }, [
    romTitle,
    romDescription,
    el('div', { class: 'rom-modal-actions' }, [romSelectBtn, romFileInput]),
    romDropHint,
    romStatus,
    romList,
    el('div', { class: 'rom-modal-footer' }, [romReloadNote, romReloadBtn, romCloseBtn]),
  ]);
  const romBackdrop = el('div', { class: 'rom-modal-backdrop hidden' }, [romModal]);

  async function refreshRomList(): Promise<void> {
    const entries = await callbacks.onListRoms();
    romList.textContent = '';
    if (entries.length === 0) {
      romList.append(el('div', { class: 'rom-list-empty' }, [t('romDialogListEmpty')]));
      return;
    }
    for (const entry of entries) {
      const nameEl = el('span', { class: 'rom-list-name' }, [entry.name]);
      const sizeEl = el('span', { class: 'rom-list-size' }, [formatRomSize(entry.size)]);
      const delBtn = el('button', { type: 'button', class: 'rom-delete-btn' }, [t('romDialogDelete')]);
      delBtn.addEventListener('click', () => {
        void (async () => {
          await callbacks.onDeleteRom(entry.name);
          await refreshRomList();
        })();
      });
      romList.append(el('div', { class: 'rom-list-item' }, [nameEl, sizeEl, delBtn]));
    }
  }

  function formatRomSize(n: number): string {
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  }

  function openRomModal(): void {
    romStatus.textContent = '';
    romBackdrop.classList.remove('hidden');
    void refreshRomList();
  }

  function closeRomModal(): void {
    romBackdrop.classList.add('hidden');
  }

  btnRomManager.addEventListener('click', () => openRomModal());
  romCloseBtn.addEventListener('click', () => closeRomModal());
  romBackdrop.addEventListener('click', (e) => {
    if (e.target === romBackdrop) closeRomModal();
  });
  romReloadBtn.addEventListener('click', () => location.reload());
  romSelectBtn.addEventListener('click', () => romFileInput.click());
  // ファイル選択とD&Dの共通登録処理。
  const registerRomFiles = (files: File[]): void => {
    if (files.length === 0) return;
    void (async () => {
      const { saved, skipped } = await callbacks.onSaveRomFiles(files);
      romStatus.textContent = t('romDialogSaved', { saved: saved.length, skipped: skipped.length });
      if (skipped.length > 0) {
        romStatus.append(el('br'), t('romDialogSkippedNote', { names: skipped.join(', ') }));
      }
      await refreshRomList();
    })();
  };
  romFileInput.addEventListener('change', () => {
    const files = Array.from(romFileInput.files ?? []);
    romFileInput.value = '';
    registerRomFiles(files);
  });
  // ダイアログ全体をドロップゾーンにする(FDスロット行のD&Dと同じdepthパターン)。
  {
    let depth = 0;
    romModal.addEventListener('dragover', (e) => e.preventDefault());
    romModal.addEventListener('dragenter', (e) => {
      e.preventDefault();
      depth++;
      romModal.classList.add('dropzone-active');
    });
    romModal.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) romModal.classList.remove('dropzone-active');
    });
    romModal.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      romModal.classList.remove('dropzone-active');
      registerRomFiles(Array.from(e.dataTransfer?.files ?? []));
    });
  }

  // ディスクライブラリダイアログ (IndexedDB保存済みHDD/FD一覧。起動前は起動、起動後は挿入に使う)。
  const libraryDescription = el('p', { class: 'rom-modal-description' }, [t('libraryDialogDescription')]);
  const libraryList = el('div', { class: 'library-list' });
  const libraryCloseBtn = el('button', { type: 'button', class: 'rom-close-btn' }, [t('libraryDialogClose')]);
  const libraryTitle = el('h2', { class: 'rom-modal-title' }, [t('libraryDialogTitle')]);
  const libraryModal = el('div', { class: 'rom-modal', role: 'dialog', 'aria-modal': 'true' }, [
    libraryTitle,
    libraryDescription,
    libraryList,
    el('div', { class: 'rom-modal-footer' }, [libraryCloseBtn]),
  ]);
  const libraryBackdrop = el('div', { class: 'rom-modal-backdrop hidden' }, [libraryModal]);

  function formatLibrarySize(n: number): string {
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  }

  async function refreshLibraryList(): Promise<void> {
    const entries = await callbacks.onListLibrary();
    libraryList.textContent = '';
    if (entries.length === 0) {
      libraryList.append(el('div', { class: 'library-list-empty' }, [t('libraryDialogListEmpty')]));
      return;
    }
    for (const entry of entries) {
      const badge = el('span', { class: `library-item-badge ${entry.kind}` }, [
        t(entry.kind === 'hdd' ? 'libraryKindHdd' : 'libraryKindFd'),
      ]);
      const nameEl = el('span', { class: 'library-item-name' }, [entry.name]);
      const metaEl = el('span', { class: 'library-item-meta' }, [
        `${formatLibrarySize(entry.size)} / ${new Date(entry.savedAt).toLocaleString()}`,
      ]);
      const actions = el('div', { class: 'library-item-actions' });

      if (!toolbarEnabled) {
        // 未起動時: HDDは「起動」、FDは「FD1で起動」。
        const bootBtn = el('button', { type: 'button', class: 'library-action-btn' }, [
          t(entry.kind === 'hdd' ? 'libraryActionBoot' : 'libraryActionBootFd1'),
        ]);
        bootBtn.addEventListener('click', () => {
          void (async () => {
            closeLibraryModal();
            await callbacks.onLibraryBoot(entry.sourceKey);
          })();
        });
        actions.append(bootBtn);
      } else if (entry.kind === 'hdd') {
        // 起動済みHDDはコアが実行中の差し替えに未対応のため注記のみ。
        actions.append(el('span', { class: 'library-item-note' }, [t('libraryActionNeedsRestart')]));
      } else {
        const insert1Btn = el('button', { type: 'button', class: 'library-action-btn' }, [
          t('libraryActionInsertFd1'),
        ]);
        insert1Btn.addEventListener('click', () => {
          void (async () => {
            await callbacks.onLibraryInsertFd(1, entry.sourceKey);
            closeLibraryModal();
          })();
        });
        const insert2Btn = el('button', { type: 'button', class: 'library-action-btn' }, [
          t('libraryActionInsertFd2'),
        ]);
        insert2Btn.addEventListener('click', () => {
          void (async () => {
            await callbacks.onLibraryInsertFd(2, entry.sourceKey);
            closeLibraryModal();
          })();
        });
        actions.append(insert1Btn, insert2Btn);
      }

      const deleteBtn = el('button', { type: 'button', class: 'library-action-btn danger' }, [
        t('libraryActionDelete'),
      ]);
      deleteBtn.addEventListener('click', () => {
        if (!confirm(t('libraryDeleteConfirm', { name: entry.name }))) return;
        void (async () => {
          await callbacks.onLibraryDelete(entry.sourceKey);
          await refreshLibraryList();
          void refreshOverlayLibraryButton();
        })();
      });
      actions.append(deleteBtn);

      libraryList.append(el('div', { class: 'library-list-item' }, [badge, nameEl, metaEl, actions]));
    }
  }

  function openLibraryModal(): void {
    libraryBackdrop.classList.remove('hidden');
    void refreshLibraryList();
  }

  function closeLibraryModal(): void {
    libraryBackdrop.classList.add('hidden');
  }

  /** ライブラリが空でなければオーバーレイの「保存済みディスクから起動」ボタンを表示する。 */
  async function refreshOverlayLibraryButton(): Promise<void> {
    try {
      const entries = await callbacks.onListLibrary();
      libraryStartBtn.classList.toggle('hidden', entries.length === 0);
    } catch {
      libraryStartBtn.classList.add('hidden');
    }
  }
  void refreshOverlayLibraryButton();

  btnDiskLibrary.addEventListener('click', () => openLibraryModal());
  libraryCloseBtn.addEventListener('click', () => closeLibraryModal());
  libraryBackdrop.addEventListener('click', (e) => {
    if (e.target === libraryBackdrop) closeLibraryModal();
  });
  libraryStartBtn.addEventListener('click', () => openLibraryModal());

  container.append(card, progressWrap, statusPanel, romBackdrop, libraryBackdrop);

  startBtn.addEventListener('click', () => callbacks.onStart());
  freeDosBtn?.addEventListener('click', () => callbacks.onStartFreeDos());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) callbacks.onStart();
  });
  btnMachineReset.addEventListener('click', () => callbacks.onMachineReset());
  btnScreenshot.addEventListener('click', () => callbacks.onScreenshot());
  btnMouse.addEventListener('click', () => callbacks.onMouseToggle());
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
    setPasteFeatureEnabled(enabled: boolean) {
      pasteFeatureEnabled = enabled;
      btnPasteText.style.display = enabled ? '' : 'none';
      if (!enabled) closePasteBar();
    },
    setToolbarEnabled(enabled: boolean) {
      toolbarEnabled = enabled;
      btnMachineReset.disabled = !enabled;
      btnScreenshot.disabled = !enabled;
      btnMouse.disabled = !enabled;
      btnSaveState.disabled = !enabled;
      btnLoadState.disabled = !enabled;
      btnReset.disabled = !enabled;
      btnPasteText.disabled = !enabled;
      if (!enabled) pasteBar.classList.add('hidden');
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
      // 起動状態が変わるとライブラリ行のアクション(起動 vs 挿入)が変わるため、開いていれば更新する。
      if (!libraryBackdrop.classList.contains('hidden')) void refreshLibraryList();
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
      btnMouse.title = t('toolbarMouse');
      btnMouse.setAttribute('aria-label', t('toolbarMouse'));
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
      btnPasteText.title = t('toolbarPasteText');
      btnPasteText.setAttribute('aria-label', t('toolbarPasteText'));
      pasteInput.placeholder = t('pasteBarPlaceholder');
      pasteEnterLabelText.textContent = t('pasteBarEnterLabel');
      pasteSendBtn.textContent = t('pasteBarSend');
      pasteCloseBtn.textContent = t('pasteBarClose');
      btnRomManager.title = t('toolbarRomManager');
      btnRomManager.setAttribute('aria-label', t('toolbarRomManager'));
      romTitle.textContent = t('romDialogTitle');
      romDescription.textContent = t('romDialogDescription');
      romSelectBtn.textContent = t('romDialogSelectFiles');
      romReloadNote.textContent = t('romDialogReloadNote');
      romReloadBtn.textContent = t('romDialogReloadBtn');
      romCloseBtn.textContent = t('romDialogClose');
      if (!romBackdrop.classList.contains('hidden')) void refreshRomList();
      libraryStartBtn.textContent = t('overlayLibraryBtn');
      btnDiskLibrary.title = t('toolbarDiskLibrary');
      btnDiskLibrary.setAttribute('aria-label', t('toolbarDiskLibrary'));
      libraryTitle.textContent = t('libraryDialogTitle');
      libraryDescription.textContent = t('libraryDialogDescription');
      libraryCloseBtn.textContent = t('libraryDialogClose');
      if (!libraryBackdrop.classList.contains('hidden')) void refreshLibraryList();
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
