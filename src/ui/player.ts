// プレイヤーUI (素のDOM構築)。canvas/オーバーレイ/ツールバー/進捗バー/D&D を組み立てる。

import { getLang, setLang, t } from './strings.ts';
import type { DiskSlot } from '../api/webnp2.ts';
import type { RomEntry } from '../api/roms.ts';
import { buildFileManagerDialog, type FileManagerCallbacks } from './filemanager.ts';

export type { LibraryEntry, LibraryGroup, LibraryNode } from './types.ts';
import type { LibraryEntry, LibraryGroup, LibraryNode } from './types.ts';

export const NATIVE_WIDTH = 640;
export const NATIVE_HEIGHT = 400;

export type DroppedKind = 'hdd' | 'fd' | 'archive';

export interface DroppedFile {
  kind: DroppedKind;
  file: File;
}

export interface PlayerCallbacks {
  onStart: () => void;
  /** オーバーレイの「FreeDOS(98) で起動」ボタン押下時（offerFreeDosChoice時のみ表示）。 */
  onStartFreeDos: () => void;
  onExportDisk: (slot: DiskSlot) => void;
  /** 起動前にセットしただけのHDDを外す。 */
  onEjectPendingHdd: () => void;
  onResetToOriginal: () => void;
  onFullscreen: () => void;
  onFilesDropped: (files: DroppedFile[]) => void;
  /** 言語トグルボタン押下時。呼び出し側で setLang 済みの状態で呼ばれる。 */
  onLangChanged: () => void;
  onMachineReset: () => void;
  onScreenshot: () => void;
  onMouseToggle: () => void;
  /** 追従モードON。ホーミング等の非同期処理はmain.ts側で行う。 */
  onMouseTrackStart: () => void;
  /** 追従モードOFF。 */
  onMouseTrackStop: () => void;
  /** 追従モード中、canvas上のホストカーソル位置(ゲスト座標0-639/0-399)を通知する(高頻度)。 */
  onMouseTrack: (x: number, y: number) => void;
  /** 追従モード中のマウスボタン押下/解放。button: 0=左/1=右。 */
  onMouseButton: (button: 0 | 1, down: boolean) => void;
  /** 仮想キーボードのキー押下/解放。code は np2 側のキーコード。 */
  onVirtualKey: (code: number, down: boolean) => void;
  /** canvasへのタッチ操作: 短いタップ=クリック(button: 0=左/1=右)。 */
  onTouchClick: (x: number, y: number, button: 0 | 1) => void;
  /** canvasへの長押し開始(左ドラッグ開始)。 */
  onTouchDragStart: () => void;
  /** canvasへの長押し終了(左ドラッグ終了)。 */
  onTouchDragEnd: () => void;
  onInsertFd: (drive: 1 | 2, file: File) => void;
  /** FDD1スロットの「FreeDOS(98) 挿入」ボタン押下時。同梱イメージをfetchして挿入する。 */
  onInsertFreeDos: () => void;
  onEjectFd: (drive: 1 | 2) => void;
  onCreateBlankFd: (drive: 1 | 2) => void;
  /** FAT16フォーマット済みのブランクHDDを作ってHDDスロットへセットする(起動前のみ)。 */
  onCreateBlankHdd: () => void;
  onSaveState: () => void;
  onLoadState: () => void;
  /** テキスト送信バーからの送信。checkbox ONなら末尾に'\n'を含めた文字列が渡される。 */
  onPasteText: (text: string) => void;
  /** テキスト送信バーの「日本語入力を有効化」ボタン押下時(ゲスト常駐ヘルパーの導入)。 */
  onSetupPasteHelper: () => void;
  /** ROM登録ダイアログの一覧取得。 */
  onListRoms: () => Promise<RomEntry[]>;
  /** ROM登録ダイアログのファイル選択時。 */
  onSaveRomFiles: (files: File[]) => Promise<{ saved: string[]; skipped: string[] }>;
  /** ROM登録ダイアログの削除ボタン押下時。 */
  onDeleteRom: (name: string) => Promise<void>;
  /** ディスクライブラリダイアログの一覧取得(フォルダ/単体が混在したツリー)。 */
  onListLibrary: () => Promise<LibraryNode[]>;
  /** ディスクライブラリから起動（HDDは'hdd'として、FDはFD1として起動）。呼び出し後モーダルは閉じられる。 */
  onLibraryBoot: (sourceKey: string) => Promise<void>;
  /**
   * ディスクライブラリのHDDを起動せずHDDスロットへセットする(起動前のみ)。
   * セット後はファイルマネージャで中身を編集でき、起動ボタンでそのまま起動できる。
   */
  onLibrarySetHdd: (sourceKey: string) => Promise<void>;
  /** 実行中にディスクライブラリのFDイメージをFD1/FD2へ挿入する。 */
  onLibraryInsertFd: (drive: 1 | 2, sourceKey: string) => Promise<void>;
  /** ディスクライブラリのエントリ削除。 */
  onLibraryDelete: (sourceKey: string) => Promise<void>;
  /** ライブラリエントリの表示名を変更する(実ファイル名は変えない)。空文字なら元のファイル名に戻す。 */
  onLibraryRename: (sourceKey: string, displayName: string) => Promise<void>;
  /** グループ(フォルダ)の表示名を変更する。 */
  onLibraryRenameGroup: (groupId: string, name: string) => Promise<void>;
  /** グループを丸ごと削除する。 */
  onLibraryDeleteGroup: (groupId: string) => Promise<void>;
  /** ファイルマネージャ(FTPクライアント風2ペイン)ダイアログが使うコールバック群。詳細はfilemanager.ts参照。 */
  fileManager: FileManagerCallbacks;
}

export interface PlayerOptions {
  /** true: URLでディスク未指定のためオーバーレイに「そのまま起動」/「FreeDOS(98)で起動」の2択を出す。 */
  offerFreeDosChoice: boolean;
  /** false でマウス追従を無効化する(既定は有効)。 */
  trackingEnabled?: boolean;
}

export interface PlayerUI {
  canvas: HTMLCanvasElement;
  setStatus(message: string, isError?: boolean): void;
  setProgress(label: string, ratio: number | null): void;
  hideProgress(): void;
  hideOverlay(): void;
  showOverlay(): void;
  setToolbarEnabled(enabled: boolean): void;
  /**
   * FDD1/FDD2/HDDスロットの表示（マウント中ファイル名、無ければ空表示）を更新する。
   * hddPending=true は「起動前にセットしただけ(未起動)」の状態で、取り外しボタンを出す。
   */
  updateSlots(slots: { fd1?: string; fd2?: string; hdd?: string; hddPending?: boolean }): void;
  /** 起動前にディスクをセット済みかどうか。オーバーレイの起動ボタンの文言を切り替える。 */
  setPendingBootMode(hasPending: boolean): void;
  /** 自身が保持するUI要素（オーバーレイ・ツールバー等）の表示文言を現在の言語で再適用する。 */
  applyStrings(): void;
  /** WebMSX方式自動起動(run=1)でAudioContextがsuspended中に表示するミュート通知バナーを出す。 */
  showMuteBanner(): void;
  /** ミュート通知バナーをフェードアウトして隠す。 */
  hideMuteBanner(): void;
  /** ディスクライブラリダイアログを開く(アーカイブ取り込み後に選ばせる用途)。 */
  openDiskLibrary(): void;
  /** ドライブアクセスランプの点灯状態を更新する(コアのアクセスカウンタ変化に応じて呼ばれる)。 */
  setDiskLamps(state: { fd1: boolean; fd2: boolean; hdd: boolean }): void;
  /** テキスト送信機能の表示/非表示。全角が有効な環境(FreeDOS(98)等)のときだけ表示する。 */
  /**
   * テキスト送信機能の表示状態を更新する。
   * buttonVisible=ツールバーボタンを出すか、fullwidthAvailable=全角がゲストに届く状態か
   * (false のときはバー内に「日本語入力を有効化」の案内を出す)。
   */
  setPasteFeature(state: { buttonVisible: boolean; fullwidthAvailable: boolean }): void;
  /** マウスキャプチャ状態の通知(onMouseToggle/pointerlockchange双方から呼ぶ)。ダブルクリック開始の可否判定に使う。 */
  setMouseCaptured(captured: boolean): void;
}

const HDD_EXTENSIONS = ['.thd', '.hdi', '.nhd', '.hdd'];
const FD_EXTENSIONS = ['.d88', '.fdi', '.xdf', '.dup', '.fdd', '.hdm'];
const ARCHIVE_EXTENSIONS = ['.zip', '.lzh'];
/** ファイル選択ダイアログのaccept属性(ディスクイメージ + 圧縮ファイル)。 */
const FD_INPUT_ACCEPT = [...FD_EXTENSIONS, ...ARCHIVE_EXTENSIONS].join(',');

/** ディスクイメージの種別を拡張子から判定する。アーカイブは対象外(nullを返す)。 */
export function classifyDroppedFile(name: string): 'hdd' | 'fd' | null {
  const lower = name.toLowerCase();
  if (HDD_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'hdd';
  if (FD_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'fd';
  return null;
}

/** ドロップ/選択されたファイルの受付種別。ディスクイメージに加えZIP/LZHも受け付ける。 */
export function classifyDroppedInput(name: string): DroppedKind | null {
  const lower = name.toLowerCase();
  if (ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'archive';
  return classifyDroppedFile(name);
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
  // 照準(十字+中心円)＝マウス追従(ホストのカーソル位置にそのまま追従)。
  mouseTrack: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M9 12a3 3 0 1 0 6 0 3 3 0 1 0 -6 0',
  // ICチップ風(四角+ピン)＝ROM/素材ファイル登録。
  rom: 'M7 7h10v10H7z M9 9h6v6H9z M7 4v3 M12 4v3 M17 4v3 M7 17v3 M12 17v3 M17 17v3 M4 7h3 M4 12h3 M4 17h3 M17 7h3 M17 12h3 M17 17h3',
  // 積み重なったディスク(FD角落とし2枚)＝ディスクライブラリ。
  library: 'M4 16h13l3-3V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1z M4 20h13a3 3 0 0 0 3-3 M8 9h6v4H8z',
  // 吹き出し(チャット風)＝ホスト側テキスト送信。
  pasteText: 'M4 5h16v11H8l-4 4V5z M7 9h10 M7 12h6',
  // 丸囲み疑問符＝使い方ページ。
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.6 9.2a2.4 2.4 0 1 1 3.3 2.2c-.7.3-.9.8-.9 1.6 M12 16.8h.01',
  // キーボード風(枠+キー点+スペースバー)＝ソフトキーボード。
  keyboard:
    'M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M6 10h.01 M9 10h.01 M12 10h.01 M15 10h.01 M18 10h.01 M6 13h.01 M9 13h.01 M12 13h.01 M15 13h.01 M18 13h.01 M8 16h8',
  // 上下の水平矢印(往復)＝ファイル転送(FTPクライアント風2ペイン)。
  fileTransfer: 'M3 8h13 M12 4l4 4-4 4 M21 16H8 M12 20l-4-4 4-4',
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

/** iconButtonのアンカー版。別タブで開くリンク(使い方ページ等)をボタン見た目で表示する。 */
function iconLinkButton(icon: string, label: string, href: string, extraClass = ''): HTMLAnchorElement {
  const a = el('a', {
    class: extraClass ? `icon-btn ${extraClass}` : 'icon-btn',
    title: label,
    'aria-label': label,
    href,
    target: '_blank',
    rel: 'noopener',
  });
  a.append(svgIcon(icon));
  return a;
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
  /** PC-98配列ソフトキーボードパネル(表示中のみ高さを加算)。 */
  kbdPanel: HTMLElement;
}

/**
 * キャンバスの整数倍スケールを決める。
 * 固定マジックナンバーではなく、実際に存在するページヘッダー/コンソールバー/
 * ページフッター/ステータス行/進捗バーの高さを動的に合計して差し引くことで、
 * 通常のウィンドウサイズで縦スクロール無しに全体が収まるようにする。
 */
function rescale(canvas: HTMLCanvasElement, stage: HTMLElement, card: HTMLElement, chrome: RescaleChrome): void {
  const appStyle = getComputedStyle(chrome.appEl);
  const appPaddingH = parseFloat(appStyle.paddingLeft) + parseFloat(appStyle.paddingRight);
  const appPaddingV = parseFloat(appStyle.paddingTop) + parseFloat(appStyle.paddingBottom);
  const gap = parseFloat(appStyle.rowGap || appStyle.gap) || 0;

  const maxWidth = Math.min(window.innerWidth - appPaddingH, 1280);

  const progressActive = chrome.progressWrap.classList.contains('active');
  // #app の子要素は card / progressWrap(非表示時はgap無し) / statusPanel の順。
  const visibleAppChildren = 2 + (progressActive ? 1 : 0);
  const gapsInApp = Math.max(0, visibleAppChildren - 1) * gap;

  const kbdVisible = !chrome.kbdPanel.classList.contains('hidden');

  const reservedHeight =
    (chrome.pageHeader?.getBoundingClientRect().height ?? 0) +
    (chrome.pageFooter?.getBoundingClientRect().height ?? 0) +
    chrome.footerBar.getBoundingClientRect().height +
    chrome.statusPanel.getBoundingClientRect().height +
    (progressActive ? chrome.progressWrap.getBoundingClientRect().height : 0) +
    (kbdVisible ? chrome.kbdPanel.getBoundingClientRect().height : 0) +
    appPaddingV +
    gapsInApp;

  // reservedHeight の再計測誤差やスクロールバー分の余白として少し余裕を持たせる。
  const maxHeight = Math.min(window.innerHeight - reservedHeight - 4, 960);
  const widthFit = maxWidth / NATIVE_WIDTH;
  const fit = Math.min(widthFit, maxHeight / NATIVE_HEIGHT);
  // 1倍未満の端数スケールは「幅」だけを基準にする。高さ由来で縮めると、
  // カード幅縮小→ツールバー折返しで周辺高さ増→さらに縮小…の収縮ループに陥るため
  // (高さが足りない場合は従来の整数倍時代と同じくページスクロールに任せる)。
  const scale = fit >= 1 ? Math.floor(fit) : Math.max(0.3, Math.min(1, widthFit));
  const w = Math.round(NATIVE_WIDTH * scale);
  const h = Math.round(NATIVE_HEIGHT * scale);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  card.style.width = `${w}px`;
}

interface KbdKeyDef {
  label: string;
  code: number;
  w?: number;
  mod?: 'oneshot' | 'lock';
}

// PC-98配列ソフトキーボードのキー定義(np2側キーコード)。
const KBD_ROWS: KbdKeyDef[][] = [
  [
    { label: 'ESC', code: 0x00 },
    { label: 'F1', code: 0x62 },
    { label: 'F2', code: 0x63 },
    { label: 'F3', code: 0x64 },
    { label: 'F4', code: 0x65 },
    { label: 'F5', code: 0x66 },
    { label: 'F6', code: 0x67 },
    { label: 'F7', code: 0x68 },
    { label: 'F8', code: 0x69 },
    { label: 'F9', code: 0x6a },
    { label: 'F10', code: 0x6b },
    { label: 'STOP', code: 0x60 },
  ],
  [
    { label: '1', code: 0x01 },
    { label: '2', code: 0x02 },
    { label: '3', code: 0x03 },
    { label: '4', code: 0x04 },
    { label: '5', code: 0x05 },
    { label: '6', code: 0x06 },
    { label: '7', code: 0x07 },
    { label: '8', code: 0x08 },
    { label: '9', code: 0x09 },
    { label: '0', code: 0x0a },
    { label: '-', code: 0x0b },
    { label: '^', code: 0x0c },
    { label: '\\', code: 0x0d },
    { label: 'BS', code: 0x0e, w: 1.4 },
  ],
  [
    { label: 'TAB', code: 0x0f, w: 1.4 },
    { label: 'Q', code: 0x10 },
    { label: 'W', code: 0x11 },
    { label: 'E', code: 0x12 },
    { label: 'R', code: 0x13 },
    { label: 'T', code: 0x14 },
    { label: 'Y', code: 0x15 },
    { label: 'U', code: 0x16 },
    { label: 'I', code: 0x17 },
    { label: 'O', code: 0x18 },
    { label: 'P', code: 0x19 },
    { label: '@', code: 0x1a },
    { label: '[', code: 0x1b },
    { label: 'RET', code: 0x1c, w: 1.4 },
  ],
  [
    { label: 'CTRL', code: 0x74, w: 1.8, mod: 'oneshot' },
    { label: 'A', code: 0x1d },
    { label: 'S', code: 0x1e },
    { label: 'D', code: 0x1f },
    { label: 'F', code: 0x20 },
    { label: 'G', code: 0x21 },
    { label: 'H', code: 0x22 },
    { label: 'J', code: 0x23 },
    { label: 'K', code: 0x24 },
    { label: 'L', code: 0x25 },
    { label: ';', code: 0x26 },
    { label: ':', code: 0x27 },
    { label: ']', code: 0x28 },
  ],
  [
    { label: 'SHIFT', code: 0x70, w: 2, mod: 'oneshot' },
    { label: 'Z', code: 0x29 },
    { label: 'X', code: 0x2a },
    { label: 'C', code: 0x2b },
    { label: 'V', code: 0x2c },
    { label: 'B', code: 0x2d },
    { label: 'N', code: 0x2e },
    { label: 'M', code: 0x2f },
    { label: ',', code: 0x30 },
    { label: '.', code: 0x31 },
    { label: '/', code: 0x32 },
    { label: '_', code: 0x33 },
  ],
  [
    { label: 'CAPS', code: 0x71, mod: 'lock' },
    { label: 'かな', code: 0x72, mod: 'lock' },
    { label: 'GRPH', code: 0x73, mod: 'oneshot' },
    { label: 'NFER', code: 0x51 },
    { label: 'SPACE', code: 0x34, w: 3.5 },
    { label: 'XFER', code: 0x35 },
    { label: 'INS', code: 0x38 },
    { label: 'DEL', code: 0x39 },
  ],
  [
    { label: 'RUP', code: 0x36 },
    { label: 'RDN', code: 0x37 },
    { label: 'HOME', code: 0x3e },
    { label: 'HELP', code: 0x3f },
    { label: '←', code: 0x3b },
    { label: '↓', code: 0x3d },
    { label: '↑', code: 0x3a },
    { label: '→', code: 0x3c },
  ],
];

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
  // 起動前にディスクをセットすると「そのまま起動」では意味が通らなくなるため、
  // セット済みかどうかで起動ボタンの文言を切り替える。
  let pendingBootMode = false;
  const startBtnLabel = (): string => {
    if (pendingBootMode) return t('startBtnPending');
    return t(options.offerFreeDosChoice ? 'startBtnPlain' : 'startBtn');
  };
  const startBtn = el('button', { class: 'start-btn', type: 'button' }, [startBtnLabel()]);
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
  const btnMouseResync = iconButton(ICONS.mouseTrack, t('toolbarMouseResync'));
  const btnReset = iconButton(ICONS.resetOriginal, t('toolbarReset'));
  const btnFullscreen = iconButton(ICONS.fullscreen, t('toolbarFullscreen'));
  const btnLang = el('button', { type: 'button', class: 'lang-toggle' }, [t('langToggle')]);
  // ROM登録は起動前でも次回起動設定として使うため、setToolbarEnabledの無効化対象にはしない。
  const btnRomManager = iconButton(ICONS.rom, t('toolbarRomManager'));
  // ディスクライブラリも起動前(起動選択)・起動後(FD挿入)どちらでも使うため常に有効。
  const btnDiskLibrary = iconButton(ICONS.library, t('toolbarDiskLibrary'));
  // テキスト送信は起動済みでないとキーバッファへ積めないため setToolbarEnabled 連動。
  const btnPasteText = iconButton(ICONS.pasteText, t('toolbarPasteText'));
  // ソフトキーボード(PC-98配列)。トグルでkbdPanelの表示/非表示を切り替える。
  const btnVirtualKbd = iconButton(ICONS.keyboard, t('toolbarVirtualKbd'));
  // ファイルマネージャ(FTPクライアント風2ペイン)。起動前(ライブラリ閲覧)でも使えるよう常に有効。
  const btnFileManager = iconButton(ICONS.fileTransfer, t('toolbarFileManager'));
  // 使い方ページは起動前でも参照できるよう、setToolbarEnabledの無効化対象にはしない。
  // 通常のリンクとして開けるよう<a>要素にする(新規タブオープンをブラウザ標準の挙動に任せる)。
  const btnHelp = iconLinkButton(ICONS.help, t('toolbarHelp'), `help.html?lang=${getLang()}`);
  const toolbar = el('div', { class: 'toolbar' }, [
    btnMachineReset,
    btnSaveState,
    btnLoadState,
    btnScreenshot,
    btnMouse,
    btnMouseResync,
    btnReset,
    btnFullscreen,
    btnVirtualKbd,
    btnPasteText,
    btnRomManager,
    btnDiskLibrary,
    btnFileManager,
    btnHelp,
    btnLang,
  ]);

  // FDスロットUI (FDD1/FDD2)
  // ドライブアクセスランプ。コア側のアクセスカウンタの変化で main.ts から点灯/消灯させる。
  const diskLamp = (label: string): HTMLElement =>
    el('span', { class: 'fd-lamp', role: 'img', 'aria-label': label });
  const fdLamp1 = diskLamp(t('diskLampLabel', { drive: 'FDD1' }));
  const fdLamp2 = diskLamp(t('diskLampLabel', { drive: 'FDD2' }));
  const hddLamp = diskLamp(t('diskLampLabel', { drive: 'HDD' }));

  const fdLabel1 = el('span', { class: 'fd-label' }, [t('fdSlotLabel', { drive: 1 })]);
  const fdName1 = el('span', { class: 'fd-name' }, [t('fdEmpty')]);
  const fdInput1 = el('input', {
    type: 'file',
    class: 'fd-file-input',
    accept: FD_INPUT_ACCEPT,
  });
  const fdInsertBtn1 = iconButton(ICONS.insert, t('fdInsert'));
  const fdLibraryBtn1 = iconButton(ICONS.library, t('fdInsertFromLibrary'));
  const fdFreeDosBtn1 = iconButton(ICONS.osDisk, t('fdInsertFreeDos'));
  const fdEjectBtn1 = iconButton(ICONS.eject, t('fdEject'));
  const fdBlankBtn1 = iconButton(ICONS.blank, t('fdCreateBlank'));
  const fdDlBtn1 = iconButton(ICONS.download, t('slotDownload'));
  const fdSlot1 = el('div', { class: 'fd-slot' }, [
    fdLamp1,
    fdLabel1,
    fdName1,
    fdInsertBtn1,
    fdInput1,
    fdLibraryBtn1,
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
    accept: FD_INPUT_ACCEPT,
  });
  const fdInsertBtn2 = iconButton(ICONS.insert, t('fdInsert'));
  const fdLibraryBtn2 = iconButton(ICONS.library, t('fdInsertFromLibrary'));
  const fdEjectBtn2 = iconButton(ICONS.eject, t('fdEject'));
  const fdBlankBtn2 = iconButton(ICONS.blank, t('fdCreateBlank'));
  const fdDlBtn2 = iconButton(ICONS.download, t('slotDownload'));
  const fdSlot2 = el('div', { class: 'fd-slot' }, [
    fdLamp2,
    fdLabel2,
    fdName2,
    fdInsertBtn2,
    fdInput2,
    fdLibraryBtn2,
    fdEjectBtn2,
    fdBlankBtn2,
    fdDlBtn2,
  ]);

  // HDDスロットUI。コアが実行中のHDD挿抜に未対応のため、読み込みボタンは起動前限定。
  // 押すと「セット」だけ行い起動はしない(セット後にファイルマネージャで編集できるようにするため)。
  // 起動はオーバーレイの起動ボタンで明示的に行う。スマホ等D&D不可環境向けの入口も兼ねる。
  const hddLabel = el('span', { class: 'fd-label' }, [t('hddSlotLabel')]);
  const hddName = el('span', { class: 'fd-name' }, [t('fdEmpty')]);
  const hddInput = el('input', {
    type: 'file',
    class: 'fd-file-input',
    accept: HDD_EXTENSIONS.join(','),
  });
  const hddInsertBtn = iconButton(ICONS.insert, t('hddInsertSet'));
  // ライブラリから直接セットする(FDの「ライブラリから挿入」と同じ操作感)。起動前のみ。
  const hddLibraryBtn = iconButton(ICONS.library, t('hddSetFromLibrary'));
  // ブランクHDD作成。HDDイメージを持っていない人でもHDDを使い始められるようにする。
  const hddBlankBtn = iconButton(ICONS.blank, t('hddCreateBlank'));
  // セット済みHDDの取り外し。起動前かつセット中のみ表示する。
  const hddEjectBtn = iconButton(ICONS.eject, t('hddEject'));
  hddEjectBtn.classList.add('hidden');
  const hddDlBtn = iconButton(ICONS.download, t('slotDownload'));
  const hddSlot = el('div', { class: 'fd-slot' }, [
    hddLamp,
    hddLabel,
    hddName,
    hddInsertBtn,
    hddInput,
    hddLibraryBtn,
    hddBlankBtn,
    hddEjectBtn,
    hddDlBtn,
  ]);

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
      const kind = classifyDroppedInput(file.name);
      if (kind !== 'fd' && kind !== 'archive') {
        alert(t('dropUnsupported'));
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
  const pasteSetupBtn = el('button', { type: 'button', class: 'paste-bar-setup-btn' }, [
    t('pasteBarSetupBtn'),
  ]);
  const pasteSetupNote = el('span', { class: 'paste-bar-setup-note' }, [t('pasteBarSetupNote')]);
  // 全角がまだ届かない環境で出す案内行(ゲスト常駐ヘルパーの導入ボタン)。
  const pasteSetupRow = el('div', { class: 'paste-bar-setup hidden' }, [pasteSetupNote, pasteSetupBtn]);
  const pasteInputRow = el('div', { class: 'paste-bar-row' }, [
    pasteInput,
    pasteEnterLabel,
    pasteSendBtn,
    pasteCloseBtn,
  ]);
  const pasteBar = el('div', { class: 'paste-bar hidden' }, [pasteSetupRow, pasteInputRow]);

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

  // ツールバーボタンの表示可否は setPasteFeature() で制御する(既定は非表示)。
  let pasteButtonVisible = false;
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
  pasteSetupBtn.addEventListener('click', () => {
    pasteSetupBtn.disabled = true;
    callbacks.onSetupPasteHelper();
  });
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
      if (now - lastShiftDownAt < 500 && pasteButtonVisible && toolbarEnabled && pasteBar.classList.contains('hidden')) {
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

  // PC-98配列ソフトキーボード。stageとfooterBarの間に常設(hiddenで開閉)。
  const kbdPanel = el('div', { class: 'kbd-panel hidden' });
  const heldOneshot = new Map<number, HTMLButtonElement>();
  for (const row of KBD_ROWS) {
    const rowEl = el('div', { class: 'kbd-row' });
    for (const def of row) {
      const keyBtn = el('button', { type: 'button', class: 'kbd-key' }, [def.label]);
      if (def.w) keyBtn.style.flexGrow = String(def.w);
      if (def.mod) {
        keyBtn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const isOn = keyBtn.classList.contains('active');
          if (isOn) {
            keyBtn.classList.remove('active');
            if (def.mod === 'oneshot') heldOneshot.delete(def.code);
            callbacks.onVirtualKey(def.code, false);
          } else {
            keyBtn.classList.add('active');
            if (def.mod === 'oneshot') heldOneshot.set(def.code, keyBtn);
            callbacks.onVirtualKey(def.code, true);
          }
        });
      } else {
        let isDown = false;
        const release = (): void => {
          if (!isDown) return;
          isDown = false;
          callbacks.onVirtualKey(def.code, false);
          // スマホIMEのワンショット修飾と同様、通常キーのbreak直後にoneshot修飾を自動解除する。
          for (const [code, btn] of heldOneshot) {
            btn.classList.remove('active');
            callbacks.onVirtualKey(code, false);
          }
          heldOneshot.clear();
        };
        keyBtn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          isDown = true;
          callbacks.onVirtualKey(def.code, true);
        });
        keyBtn.addEventListener('pointerup', () => release());
        keyBtn.addEventListener('pointercancel', () => release());
        keyBtn.addEventListener('pointerleave', () => release());
      }
      rowEl.append(keyBtn);
    }
    kbdPanel.append(rowEl);
  }

  // WebMSX風: カードは実行画面(キャンバス) + グレーのコンソールバー(ツールバー/FDスロット)のみ。
  // 黒いページヘッダー/グレーのページフッターは index.html 側の全幅要素として別に存在する。
  const footerBar = el('div', { class: 'console-footer' }, [toolbar, fdSlots]);
  const card = el('div', { class: 'console-card' });
  card.append(stage, kbdPanel, footerBar);

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

  /** 展開状態のグループID。再描画をまたいで開閉を保つ。 */
  const expandedLibraryGroups = new Set<string>();

  /** ライブラリ1件分の行(バッジ/名前/サイズ/操作ボタン)を組み立てる。 */
  function buildLibraryItemRow(entry: LibraryEntry, inGroup: boolean): HTMLElement {
    const badge = el('span', { class: `library-item-badge ${entry.kind}` }, [
      t(entry.kind === 'hdd' ? 'libraryKindHdd' : 'libraryKindFd'),
    ]);
    const nameEl = el('span', { class: 'library-item-name' }, [entry.displayName]);
    // リネーム済みなら元のファイル名をツールチップで確認できるようにする。
    if (entry.displayName !== entry.name) nameEl.title = entry.name;
    const metaEl = el('span', { class: 'library-item-meta' }, [
      `${formatLibrarySize(entry.size)} / ${new Date(entry.savedAt).toLocaleString()}`,
    ]);
    const actions = el('div', { class: 'library-item-actions' });

    if (!toolbarEnabled && entry.kind === 'hdd') {
      // 未起動時のHDDは「HDDにセット」と「起動」。
      // ファイルマネージャでHDDの中身を編集できるのは起動前だけなので、
      // 起動せずスロットへ割り当てるだけの導線を用意する。
      const setBtn = el('button', { type: 'button', class: 'library-action-btn' }, [
        t('libraryActionSetHdd'),
      ]);
      setBtn.addEventListener('click', () => {
        void (async () => {
          closeLibraryModal();
          await callbacks.onLibrarySetHdd(entry.sourceKey);
        })();
      });
      actions.append(setBtn);

      const bootBtn = el('button', { type: 'button', class: 'library-action-btn' }, [
        t('libraryActionBoot'),
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
      // FDは起動前/起動後どちらもFD1/FD2を選べる(起動前はそのFDをセットして起動する)。
      for (const drive of [1, 2] as const) {
        const insertBtn = el('button', { type: 'button', class: 'library-action-btn' }, [
          t(drive === 1 ? 'libraryActionInsertFd1' : 'libraryActionInsertFd2'),
        ]);
        insertBtn.addEventListener('click', () => {
          void (async () => {
            await callbacks.onLibraryInsertFd(drive, entry.sourceKey);
            closeLibraryModal();
          })();
        });
        actions.append(insertBtn);
      }
    }

    const renameBtn = el('button', { type: 'button', class: 'library-action-btn' }, [
      t('libraryActionRename'),
    ]);
    renameBtn.addEventListener('click', () => {
      const next = prompt(t('libraryRenamePrompt', { name: entry.name }), entry.displayName);
      if (next === null) return;
      void (async () => {
        await callbacks.onLibraryRename(entry.sourceKey, next);
        await refreshLibraryList();
      })();
    });
    actions.append(renameBtn);

    const deleteBtn = el('button', { type: 'button', class: 'library-action-btn danger' }, [
      t('libraryActionDelete'),
    ]);
    deleteBtn.addEventListener('click', () => {
      if (!confirm(t('libraryDeleteConfirm', { name: entry.displayName }))) return;
      void (async () => {
        await callbacks.onLibraryDelete(entry.sourceKey);
        await refreshLibraryList();
        void refreshOverlayLibraryButton();
      })();
    });
    actions.append(deleteBtn);

    return el('div', { class: `library-list-item${inGroup ? ' in-group' : ''}` }, [
      badge,
      nameEl,
      metaEl,
      actions,
    ]);
  }

  /** アーカイブ由来グループのフォルダ行(クリックで開閉)と、その中身の行をまとめて組み立てる。 */
  function buildLibraryGroupRow(group: LibraryGroup): HTMLElement {
    const expanded = expandedLibraryGroups.has(group.id);
    const twisty = el('span', { class: 'library-group-twisty' }, [expanded ? '▼' : '▶']);
    const nameEl = el('span', { class: 'library-group-name' }, [group.name]);
    const countEl = el('span', { class: 'library-item-meta' }, [
      t('libraryGroupCount', { count: group.entries.length }),
    ]);
    const actions = el('div', { class: 'library-item-actions' });

    const renameBtn = el('button', { type: 'button', class: 'library-action-btn' }, [
      t('libraryActionRename'),
    ]);
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = prompt(t('libraryRenameGroupPrompt'), group.name);
      if (next === null) return;
      void (async () => {
        await callbacks.onLibraryRenameGroup(group.id, next);
        await refreshLibraryList();
      })();
    });
    const deleteBtn = el('button', { type: 'button', class: 'library-action-btn danger' }, [
      t('libraryActionDelete'),
    ]);
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(t('libraryDeleteGroupConfirm', { name: group.name, count: group.entries.length })))
        return;
      void (async () => {
        await callbacks.onLibraryDeleteGroup(group.id);
        await refreshLibraryList();
        void refreshOverlayLibraryButton();
      })();
    });
    actions.append(renameBtn, deleteBtn);

    const header = el(
      'div',
      { class: 'library-list-group', role: 'button', tabindex: '0', 'aria-expanded': String(expanded) },
      [twisty, nameEl, countEl, actions],
    );
    const toggle = (): void => {
      if (expandedLibraryGroups.has(group.id)) expandedLibraryGroups.delete(group.id);
      else expandedLibraryGroups.add(group.id);
      void refreshLibraryList();
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    const children = group.entries.map((entry) => buildLibraryItemRow(entry, true));
    return el('div', { class: 'library-group' }, [
      header,
      ...(expanded ? children : []),
    ]);
  }

  async function refreshLibraryList(): Promise<void> {
    const nodes = await callbacks.onListLibrary();
    libraryList.textContent = '';
    if (nodes.length === 0) {
      libraryList.append(el('div', { class: 'library-list-empty' }, [t('libraryDialogListEmpty')]));
      return;
    }
    for (const node of nodes) {
      libraryList.append(
        node.kind === 'group' ? buildLibraryGroupRow(node.group) : buildLibraryItemRow(node.entry, false),
      );
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

  // --- FDDスロットの「ライブラリから挿入」メニュー ---
  // アーカイブ由来のグループはフォルダ1行にまとめ、クリックで中身(サブメニュー)へ潜る。
  // ディスク入れ替えのたびにライブラリダイアログを開かずに済むようにするための導線。
  const fdLibraryMenu = el('div', { class: 'library-menu hidden', role: 'menu' });

  function closeFdLibraryMenu(): void {
    fdLibraryMenu.classList.add('hidden');
    fdLibraryMenu.textContent = '';
  }

  function menuRow(label: string, extra?: string, cls = ''): HTMLElement {
    const children: Array<Node | string> = [el('span', { class: 'library-menu-label' }, [label])];
    if (extra) children.push(el('span', { class: 'library-menu-extra' }, [extra]));
    return el('div', { class: `library-menu-item ${cls}`.trim(), role: 'menuitem', tabindex: '0' }, children);
  }

  /** メニュー内の1行に、クリック/Enterで同じ動作を割り当てる。 */
  function onActivate(node: HTMLElement, handler: () => void): void {
    node.addEventListener('click', handler);
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  }

  /**
   * スロットメニューの対象。FDは指定ドライブへ挿入、HDDは起動前のHDDスロットへセットする。
   * 一覧の絞り込み(kind)と決定時の動作だけが違うので、描画処理は共通化している。
   */
  type SlotMenuTarget = { kind: 'fd'; drive: 1 | 2 } | { kind: 'hdd' };

  function slotMenuTitle(target: SlotMenuTarget): string {
    return target.kind === 'fd'
      ? t('fdInsertFromLibraryTitle', { drive: target.drive })
      : t('hddSetFromLibraryTitle');
  }

  function activateSlotMenuEntry(target: SlotMenuTarget, sourceKey: string): void {
    closeFdLibraryMenu();
    if (target.kind === 'fd') {
      void callbacks.onLibraryInsertFd(target.drive, sourceKey);
    } else {
      void callbacks.onLibrarySetHdd(sourceKey);
    }
  }

  /** グループ内のディスク一覧(サブメニュー)を描画する。 */
  function renderFdLibrarySubmenu(
    target: SlotMenuTarget,
    group: LibraryGroup,
    nodes: LibraryNode[],
  ): void {
    fdLibraryMenu.textContent = '';
    const back = menuRow(t('libraryMenuBack'), undefined, 'back');
    onActivate(back, () => renderFdLibraryMenu(target, nodes));
    fdLibraryMenu.append(back, el('div', { class: 'library-menu-title' }, [group.name]));
    for (const entry of group.entries) {
      if (entry.kind !== target.kind) continue;
      const row = menuRow(entry.displayName);
      onActivate(row, () => activateSlotMenuEntry(target, entry.sourceKey));
      fdLibraryMenu.append(row);
    }
  }

  /** メニューの第1階層(単体イメージ + グループのフォルダ行)を描画する。 */
  function renderFdLibraryMenu(target: SlotMenuTarget, nodes: LibraryNode[]): void {
    fdLibraryMenu.textContent = '';
    fdLibraryMenu.append(el('div', { class: 'library-menu-title' }, [slotMenuTitle(target)]));
    let shown = 0;
    for (const node of nodes) {
      if (node.kind === 'group') {
        // 対象種別を1枚も含まないグループは行き先が無いので出さない。
        const count = node.group.entries.filter((e) => e.kind === target.kind).length;
        if (count === 0) continue;
        const row = menuRow(node.group.name, t('libraryGroupCount', { count }), 'group');
        onActivate(row, () => renderFdLibrarySubmenu(target, node.group, nodes));
        fdLibraryMenu.append(row);
        shown++;
      } else if (node.entry.kind === target.kind) {
        const entry = node.entry;
        const row = menuRow(entry.displayName);
        onActivate(row, () => activateSlotMenuEntry(target, entry.sourceKey));
        fdLibraryMenu.append(row);
        shown++;
      }
    }
    if (shown === 0) {
      fdLibraryMenu.append(el('div', { class: 'library-menu-empty' }, [t('libraryDialogListEmpty')]));
    }
  }

  async function openFdLibraryMenu(target: SlotMenuTarget, anchorEl: HTMLElement): Promise<void> {
    const nodes = await callbacks.onListLibrary();
    renderFdLibraryMenu(target, nodes);
    // 位置を左上に固定してから採寸する。未指定(static位置)のままだと折り返し幅が
    // 表示位置に引きずられ、正しいサイズが得られない。
    fdLibraryMenu.style.left = '0px';
    fdLibraryMenu.style.top = '0px';
    fdLibraryMenu.classList.remove('hidden');
    // ボタン直上に出す(スロット行はカード下端にあるため、下方向だと画面外に出やすい)。
    const rect = anchorEl.getBoundingClientRect();
    const menuRect = fdLibraryMenu.getBoundingClientRect();
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - menuRect.width - 4));
    const top = Math.max(4, rect.top - menuRect.height - 4);
    fdLibraryMenu.style.left = `${Math.round(left)}px`;
    fdLibraryMenu.style.top = `${Math.round(top)}px`;
  }

  for (const [btn, target] of [
    [fdLibraryBtn1, { kind: 'fd', drive: 1 }],
    [fdLibraryBtn2, { kind: 'fd', drive: 2 }],
    [hddLibraryBtn, { kind: 'hdd' }],
  ] as Array<[HTMLElement, SlotMenuTarget]>) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!fdLibraryMenu.classList.contains('hidden')) {
        closeFdLibraryMenu();
        return;
      }
      void openFdLibraryMenu(target, btn);
    });
  }
  // メニュー内のクリックはここで止める。サブメニューへ潜る際に行を作り直すため、
  // document まで伝播すると「クリック対象が既にメニュー配下に無い」と判定されて閉じてしまう。
  fdLibraryMenu.addEventListener('click', (e) => e.stopPropagation());
  // メニュー外クリック/Escで閉じる。
  document.addEventListener('click', () => {
    if (fdLibraryMenu.classList.contains('hidden')) return;
    closeFdLibraryMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFdLibraryMenu();
  });

  // ファイルマネージャ(FTPクライアント風2ペイン)ダイアログ。詳細な構築・状態管理はfilemanager.tsに委譲する。
  const fileManagerDialog = buildFileManagerDialog(container, callbacks.fileManager);
  btnFileManager.addEventListener('click', () => fileManagerDialog.open());

  container.append(card, progressWrap, statusPanel, romBackdrop, libraryBackdrop, fdLibraryMenu);

  startBtn.addEventListener('click', () => callbacks.onStart());
  freeDosBtn?.addEventListener('click', () => callbacks.onStartFreeDos());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) callbacks.onStart();
  });
  btnMachineReset.addEventListener('click', () => callbacks.onMachineReset());
  btnScreenshot.addEventListener('click', () => callbacks.onScreenshot());
  btnMouse.addEventListener('click', () => callbacks.onMouseToggle());

  // マウス追従は常時有効(オプション trackingEnabled=false で無効化できる)。
  // キャプチャ(pointer lock)せず、canvas上のホストカーソル位置をゲストへ伝える。
  // 基準合わせ(ホーミング)は初回にカーソルがcanvasへ入った時点で一度だけ行い、
  // ズレたときはツールバーの「マウス再同期」で作り直す。
  let mouseCaptured = false;
  let trackingHomed = false;
  const trackingEnabled = options.trackingEnabled !== false;

  const isTracking = (): boolean => trackingEnabled && toolbarEnabled && !mouseCaptured;

  const ensureHomed = (): void => {
    if (trackingHomed || !isTracking()) return;
    trackingHomed = true;
    stage.classList.add('tracking');
    callbacks.onMouseTrackStart();
  };

  const resyncTracking = (): void => {
    if (!isTracking()) return;
    trackingHomed = true;
    stage.classList.add('tracking');
    callbacks.onMouseTrackStart();
  };

  btnMouseResync.addEventListener('click', () => resyncTracking());

  canvas.addEventListener('mouseenter', () => ensureHomed());

  // マウスキャプチャの開始は「右ダブルクリック」。追従が常時有効なので、
  // 左ダブルクリックはゲスト側の操作(アイコンを開く等)として通す必要がある。
  // pointer lock要求はユーザー操作から同期的に呼ぶ必要があるため非同期処理を挟まない。
  let lastRightClickAt = 0;
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!toolbarEnabled || mouseCaptured) return;
    const now = performance.now();
    if (now - lastRightClickAt < 500) {
      lastRightClickAt = 0;
      callbacks.onMouseToggle();
      return;
    }
    lastRightClickAt = now;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isTracking()) return;
    ensureHomed();
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(NATIVE_WIDTH - 1, Math.round(((e.clientX - rect.left) / rect.width) * NATIVE_WIDTH)),
    );
    const y = Math.max(
      0,
      Math.min(NATIVE_HEIGHT - 1, Math.round(((e.clientY - rect.top) / rect.height) * NATIVE_HEIGHT)),
    );
    callbacks.onMouseTrack(x, y);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!isTracking()) return;
    if (e.button === 0 || e.button === 2) callbacks.onMouseButton(e.button === 0 ? 0 : 1, true);
  });
  canvas.addEventListener('mouseup', (e) => {
    if (!isTracking()) return;
    if (e.button === 0 || e.button === 2) callbacks.onMouseButton(e.button === 0 ? 0 : 1, false);
  });

  // タッチ操作: 1本指移動=カーソル追従 / 短いタップ=左クリック / 長押し(450ms静止)=左ドラッグ / 2本指タップ=右クリック
  let touchState: {
    id: number;
    startX: number;
    startY: number;
    startT: number;
    moved: boolean;
    drag: boolean;
    lastGX: number;
    lastGY: number;
    twoFinger: boolean;
    lpTimer: number;
  } | null = null;
  const touchToGuest = (tp: Touch): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(NATIVE_WIDTH - 1, Math.round(((tp.clientX - rect.left) / rect.width) * NATIVE_WIDTH))),
      y: Math.max(0, Math.min(NATIVE_HEIGHT - 1, Math.round(((tp.clientY - rect.top) / rect.height) * NATIVE_HEIGHT))),
    };
  };
  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (!isTracking()) return;
      e.preventDefault();
      ensureHomed();
      if (e.touches.length === 1) {
        const tp = e.touches[0];
        const g = touchToGuest(tp);
        const state = {
          id: tp.identifier,
          startX: tp.clientX,
          startY: tp.clientY,
          startT: performance.now(),
          moved: false,
          drag: false,
          lastGX: g.x,
          lastGY: g.y,
          twoFinger: false,
          lpTimer: 0,
        };
        touchState = state;
        callbacks.onMouseTrack(g.x, g.y);
        state.lpTimer = window.setTimeout(() => {
          if (touchState && !touchState.moved && !touchState.twoFinger) {
            touchState.drag = true;
            callbacks.onTouchDragStart();
          }
        }, 450);
      } else if (touchState) {
        touchState.twoFinger = true;
        clearTimeout(touchState.lpTimer);
      }
    },
    { passive: false },
  );
  canvas.addEventListener(
    'touchmove',
    (e) => {
      const state = touchState;
      if (!state) return;
      e.preventDefault();
      const tp = Array.from(e.touches).find((t2) => t2.identifier === state.id);
      if (!tp) return;
      if (!state.moved && Math.hypot(tp.clientX - state.startX, tp.clientY - state.startY) > 12) {
        state.moved = true;
        if (!state.drag) clearTimeout(state.lpTimer);
      }
      const g = touchToGuest(tp);
      state.lastGX = g.x;
      state.lastGY = g.y;
      callbacks.onMouseTrack(g.x, g.y);
    },
    { passive: false },
  );
  canvas.addEventListener(
    'touchend',
    (e) => {
      const state = touchState;
      if (!state) return;
      e.preventDefault();
      if (e.touches.length > 0) return; // まだ指が残っている
      clearTimeout(state.lpTimer);
      const dur = performance.now() - state.startT;
      if (state.drag) callbacks.onTouchDragEnd();
      else if (state.twoFinger && dur < 400) callbacks.onTouchClick(state.lastGX, state.lastGY, 1);
      else if (!state.moved && dur < 400) callbacks.onTouchClick(state.lastGX, state.lastGY, 0);
      touchState = null;
    },
    { passive: false },
  );
  canvas.addEventListener('touchcancel', () => {
    const state = touchState;
    if (!state) return;
    clearTimeout(state.lpTimer);
    if (state.drag) callbacks.onTouchDragEnd();
    touchState = null;
  });
  btnSaveState.addEventListener('click', () => callbacks.onSaveState());
  btnLoadState.addEventListener('click', () => callbacks.onLoadState());
  btnReset.addEventListener('click', () => {
    if (confirm(t('resetConfirm'))) {
      callbacks.onResetToOriginal();
    }
  });
  btnFullscreen.addEventListener('click', () => callbacks.onFullscreen());
  btnVirtualKbd.addEventListener('click', () => {
    const nowHidden = kbdPanel.classList.toggle('hidden');
    btnVirtualKbd.classList.toggle('active', !nowHidden);
    scheduleRescale();
  });
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

  hddInsertBtn.addEventListener('click', () => hddInput.click());
  hddInput.addEventListener('change', () => {
    const file = hddInput.files?.[0];
    hddInput.value = '';
    if (file) callbacks.onFilesDropped([{ kind: 'hdd', file }]);
  });
  hddBlankBtn.addEventListener('click', () => callbacks.onCreateBlankHdd());
  hddEjectBtn.addEventListener('click', () => callbacks.onEjectPendingHdd());
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
      const kind = classifyDroppedInput(file.name);
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
    kbdPanel,
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
  chromeObserver.observe(kbdPanel);
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
    openDiskLibrary() {
      openLibraryModal();
    },
    setDiskLamps(state: { fd1: boolean; fd2: boolean; hdd: boolean }) {
      fdLamp1.classList.toggle('active', state.fd1);
      fdLamp2.classList.toggle('active', state.fd2);
      hddLamp.classList.toggle('active', state.hdd);
    },
    showOverlay() {
      overlay.classList.remove('hidden');
    },
    setPasteFeature(state: { buttonVisible: boolean; fullwidthAvailable: boolean }) {
      pasteButtonVisible = state.buttonVisible;
      btnPasteText.style.display = state.buttonVisible ? '' : 'none';
      pasteSetupRow.classList.toggle('hidden', state.fullwidthAvailable);
      if (state.fullwidthAvailable) {
        pasteSetupBtn.disabled = false;
      }
      if (!state.buttonVisible) closePasteBar();
    },
    setMouseCaptured(captured: boolean) {
      mouseCaptured = captured;
    },
    setToolbarEnabled(enabled: boolean) {
      toolbarEnabled = enabled;
      btnMachineReset.disabled = !enabled;
      btnScreenshot.disabled = !enabled;
      btnMouse.disabled = !enabled;
      btnMouseResync.disabled = !enabled;
      if (!enabled) {
        trackingHomed = false;
        stage.classList.remove('tracking');
      }
      btnSaveState.disabled = !enabled;
      btnLoadState.disabled = !enabled;
      btnReset.disabled = !enabled;
      btnPasteText.disabled = !enabled;
      if (!enabled) pasteBar.classList.add('hidden');
      btnVirtualKbd.disabled = !enabled;
      if (!enabled) {
        kbdPanel.classList.add('hidden');
        btnVirtualKbd.classList.remove('active');
        for (const [code, btn] of heldOneshot) {
          btn.classList.remove('active');
          callbacks.onVirtualKey(code, false);
        }
        heldOneshot.clear();
      }
      // FD挿入は起動前=そのFDから起動(main.ts側で分岐)、起動後=ライブ交換のため常時有効。
      fdInsertBtn1.disabled = false;
      fdInsertBtn2.disabled = false;
      fdFreeDosBtn1.disabled = !enabled;
      fdBlankBtn1.disabled = !enabled;
      fdBlankBtn2.disabled = !enabled;
      fdEjectBtn1.disabled = !enabled || !slotMounted.fd1;
      fdEjectBtn2.disabled = !enabled || !slotMounted.fd2;
      fdDlBtn1.disabled = !enabled || !slotMounted.fd1;
      fdDlBtn2.disabled = !enabled || !slotMounted.fd2;
      hddDlBtn.disabled = !enabled || !slotMounted.hdd;
      // HDD関連の操作はコアが実行中の挿抜に未対応のため起動前のみ有効(ツールバーと逆)。
      hddInsertBtn.disabled = enabled;
      hddLibraryBtn.disabled = enabled;
      hddBlankBtn.disabled = enabled;
      // 起動したらセット状態は消えるので、取り外しボタンも隠す。
      if (enabled) hddEjectBtn.classList.add('hidden');
      // 起動状態が変わるとライブラリ行のアクション(起動 vs 挿入)が変わるため、開いていれば更新する。
      if (!libraryBackdrop.classList.contains('hidden')) void refreshLibraryList();
    },
    updateSlots(slots: { fd1?: string; fd2?: string; hdd?: string; hddPending?: boolean }) {
      slotMounted = slots;
      fdName1.textContent = slots.fd1 ?? t('fdEmpty');
      fdName2.textContent = slots.fd2 ?? t('fdEmpty');
      hddName.textContent = slots.hdd ?? t('fdEmpty');
      // セットしただけ(未起動)のHDDは、マウント済みと区別できるよう控えめに印を付ける。
      hddName.classList.toggle('pending', Boolean(slots.hddPending));
      fdEjectBtn1.disabled = !toolbarEnabled || !slots.fd1;
      fdEjectBtn2.disabled = !toolbarEnabled || !slots.fd2;
      fdDlBtn1.disabled = !toolbarEnabled || !slots.fd1;
      fdDlBtn2.disabled = !toolbarEnabled || !slots.fd2;
      // 起動前にセットしたHDDはコア未マウントでもダウンロード/取り外しできる。
      hddDlBtn.disabled = !slots.hdd || (!toolbarEnabled && !slots.hddPending);
      hddEjectBtn.classList.toggle('hidden', !slots.hddPending);
    },
    setPendingBootMode(hasPending: boolean) {
      pendingBootMode = hasPending;
      startBtn.textContent = startBtnLabel();
    },
    applyStrings() {
      overlayNoteLine1.textContent = t('overlayNote1');
      overlayNoteLine2.textContent = t('overlayNote2');
      startBtn.textContent = startBtnLabel();
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
      btnMouseResync.title = t('toolbarMouseResync');
      btnMouseResync.setAttribute('aria-label', t('toolbarMouseResync'));
      btnReset.title = t('toolbarReset');
      btnReset.setAttribute('aria-label', t('toolbarReset'));
      btnFullscreen.title = t('toolbarFullscreen');
      btnFullscreen.setAttribute('aria-label', t('toolbarFullscreen'));
      btnHelp.title = t('toolbarHelp');
      btnHelp.setAttribute('aria-label', t('toolbarHelp'));
      btnHelp.href = `help.html?lang=${getLang()}`;
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
      fdLamp1.setAttribute('aria-label', t('diskLampLabel', { drive: 'FDD1' }));
      fdLamp2.setAttribute('aria-label', t('diskLampLabel', { drive: 'FDD2' }));
      hddLamp.setAttribute('aria-label', t('diskLampLabel', { drive: 'HDD' }));
      for (const btn of [fdLibraryBtn1, fdLibraryBtn2]) {
        btn.title = t('fdInsertFromLibrary');
        btn.setAttribute('aria-label', t('fdInsertFromLibrary'));
      }
      closeFdLibraryMenu();
      fdEjectBtn1.title = t('fdEject');
      fdEjectBtn1.setAttribute('aria-label', t('fdEject'));
      fdEjectBtn2.title = t('fdEject');
      fdEjectBtn2.setAttribute('aria-label', t('fdEject'));
      fdBlankBtn1.title = t('fdCreateBlank');
      fdBlankBtn1.setAttribute('aria-label', t('fdCreateBlank'));
      fdBlankBtn2.title = t('fdCreateBlank');
      fdBlankBtn2.setAttribute('aria-label', t('fdCreateBlank'));
      hddInsertBtn.title = t('hddInsertSet');
      hddInsertBtn.setAttribute('aria-label', t('hddInsertSet'));
      hddLibraryBtn.title = t('hddSetFromLibrary');
      hddLibraryBtn.setAttribute('aria-label', t('hddSetFromLibrary'));
      hddBlankBtn.title = t('hddCreateBlank');
      hddBlankBtn.setAttribute('aria-label', t('hddCreateBlank'));
      hddEjectBtn.title = t('hddEject');
      hddEjectBtn.setAttribute('aria-label', t('hddEject'));
      fdDlBtn1.title = t('slotDownload');
      fdDlBtn1.setAttribute('aria-label', t('slotDownload'));
      fdDlBtn2.title = t('slotDownload');
      fdDlBtn2.setAttribute('aria-label', t('slotDownload'));
      hddDlBtn.title = t('slotDownload');
      hddDlBtn.setAttribute('aria-label', t('slotDownload'));
      muteBanner.textContent = t('audioMuted');
      pasteSetupBtn.textContent = t('pasteBarSetupBtn');
      pasteSetupNote.textContent = t('pasteBarSetupNote');
      btnPasteText.title = t('toolbarPasteText');
      btnPasteText.setAttribute('aria-label', t('toolbarPasteText'));
      btnVirtualKbd.title = t('toolbarVirtualKbd');
      btnVirtualKbd.setAttribute('aria-label', t('toolbarVirtualKbd'));
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
      btnFileManager.title = t('toolbarFileManager');
      btnFileManager.setAttribute('aria-label', t('toolbarFileManager'));
      fileManagerDialog.applyStrings();
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
