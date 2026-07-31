// UI文字列辞書 + 言語解決。日本語/英語を切り替える。
// キーは Dict インターフェースで型定義し、ja/en どちらかにしか無いキーはコンパイルエラーになる。

export type Lang = 'ja' | 'en';

const STORAGE_KEY = 'webnp2.lang';

interface Dict {
  title(): string;
  footerLicense(): string;
  /** ページフッターの本リポジトリGitHubリンクのラベル。 */
  footerGithubLabel(): string;
  overlayNote1(): string;
  overlayNote2(): string;
  startBtn(): string;
  startBtnPlain(): string;
  startBtnFreeDos(): string;
  toolbarReset(): string;
  toolbarFullscreen(): string;
  toolbarMachineReset(): string;
  toolbarSaveState(): string;
  toolbarLoadState(): string;
  /** ツールバーの言語トグルボタンに表示するラベル（＝切替先の言語名）。 */
  langToggle(): string;
  resetConfirm(): string;
  fdSlotLabel(args: { drive: number }): string;
  hddSlotLabel(): string;
  fdEmpty(): string;
  fdInsert(): string;
  fdInsertFreeDos(): string;
  fdEject(): string;
  fdCreateBlank(): string;
  slotDownload(): string;
  statusMachineReset(): string;
  statusStateSaved(): string;
  statusStateLoaded(): string;
  statusFdInserted(args: { drive: number; name: string }): string;
  statusFdEjected(args: { drive: number }): string;
  statusFreeDosInserted(args: { drive: number }): string;
  dropUnsupported(): string;
  dropConfirm(args: { count: number; names: string }): string;
  diskReplaceUnsupported(): string;
  noMountedImage(): string;
  pickSlotPrompt(args: { action: string; slots: string }): string;
  pickSlotActionReset(): string;
  statusPreparing(): string;
  statusNoImage(): string;
  statusCoreBooting(): string;
  statusBootSuccess(): string;
  statusBootFailed(args: { message: string }): string;
  statusResumed(args: { label: string; name: string }): string;
  statusFetching(args: { label: string; name: string }): string;
  statusFetchingProgress(args: {
    label: string;
    name: string;
    loaded: string;
    total: string | null;
  }): string;
  fetchFailedNetwork(args: { url: string }): string;
  fetchFailedHttp(args: { url: string; status: number }): string;
  /** WebMSX方式自動起動(run=1)時、AudioContextがsuspendedのままの間に表示するバナー文言。 */
  audioMuted(): string;
}

const STRINGS: Record<Lang, Dict> = {
  ja: {
    title: () => 'WebNP2 - PC-98 エミュレータ Web プレイヤー',
    footerLicense: () =>
      'Core: NP2kai-wasm (BSD系ライセンス, public/core/LICENSE.NP2kai) / ROM・市販ソフトのイメージは同梱していません / FreeDOS(98) (GPL, ソース: github.com/lpproj/fdkernel, 詳細: public/freedos/README.txt)',
    footerGithubLabel: () => 'GitHubで見る',
    overlayNote1: () => '音声再生の制限上、クリック操作で起動します。',
    overlayNote2: () => 'ファイルをドラッグ&ドロップしてHDD/FDイメージを読み込むこともできます。',
    startBtn: () => 'クリックして起動',
    startBtnPlain: () => 'そのまま起動',
    startBtnFreeDos: () => 'FreeDOS(98) で起動',
    toolbarReset: () => '初期状態に戻す',
    toolbarFullscreen: () => 'フルスクリーン',
    toolbarMachineReset: () => 'マシンリセット',
    toolbarSaveState: () => 'ステート保存',
    toolbarLoadState: () => 'ステート復元',
    langToggle: () => 'EN',
    resetConfirm: () => '現在の進行状況を破棄し、配布元の初期状態に戻します。よろしいですか？',
    fdSlotLabel: ({ drive }) => `FDD${drive}`,
    hddSlotLabel: () => 'HDD',
    fdEmpty: () => '(空)',
    fdInsert: () => '挿入',
    fdInsertFreeDos: () => 'FreeDOS(98) 挿入',
    fdEject: () => '排出',
    fdCreateBlank: () => 'ブランク作成',
    slotDownload: () => 'ダウンロード',
    statusMachineReset: () => 'マシンをリセットしました。',
    statusStateSaved: () => 'ステートを保存しました。',
    statusStateLoaded: () => 'ステートを復元しました。',
    statusFdInserted: ({ drive, name }) => `FDD${drive} に挿入しました: ${name}`,
    statusFdEjected: ({ drive }) => `FDD${drive} を排出しました。`,
    statusFreeDosInserted: ({ drive }) =>
      `FDD${drive} に FreeDOS(98) を挿入しました。マシンリセットで起動します。`,
    dropUnsupported: () =>
      '対応していないファイル形式です（HDD: .thd/.hdi/.nhd/.hdd, FD: .d88/.fdi/.xdf/.dup 等）',
    dropConfirm: ({ count, names }) => `${count}件のファイルを読み込みます: ${names}\nよろしいですか？`,
    diskReplaceUnsupported: () =>
      '起動後のディスク差し替えは Phase 2 で対応予定です。ページを再読み込みしてください。',
    noMountedImage: () => 'マウント中のイメージがありません。',
    pickSlotPrompt: ({ action, slots }) => `${action}対象を選択してください: ${slots}`,
    pickSlotActionReset: () => '初期状態に戻す',
    statusPreparing: () => '起動準備中…',
    statusNoImage: () => 'イメージが指定されていません。ファイルをドラッグ&ドロップして読み込んでください。',
    statusCoreBooting: () => 'コアを起動しています…',
    statusBootSuccess: () => '起動しました。',
    statusBootFailed: ({ message }) => `起動に失敗しました: ${message}`,
    statusResumed: ({ label, name }) => `${label}: 前回の続きから再開中です（${name}）`,
    statusFetching: ({ label, name }) => `${label} を取得中: ${name}`,
    statusFetchingProgress: ({ label, name, loaded, total }) =>
      `${label} を取得中: ${name} (${loaded}${total ? ' / ' + total : ''})`,
    fetchFailedNetwork: ({ url }) =>
      `イメージの取得に失敗しました（ネットワークエラーまたはCORS設定を確認してください）: ${url}`,
    fetchFailedHttp: ({ url, status }) => `イメージの取得に失敗しました（HTTP ${status}）: ${url}`,
    audioMuted: () => '🔇 音声はミュート中です。クリックで有効になります',
  },
  en: {
    title: () => 'WebNP2 - PC-98 Emulator Web Player',
    footerLicense: () =>
      'Core: NP2kai-wasm (BSD-style license, public/core/LICENSE.NP2kai) / No ROM or commercial software disk images included / FreeDOS(98) (GPL, source: github.com/lpproj/fdkernel, see public/freedos/README.txt)',
    footerGithubLabel: () => 'View on GitHub',
    overlayNote1: () => 'Audio requires a user gesture, so click to start.',
    overlayNote2: () => 'You can also drag & drop HDD/FD disk images.',
    startBtn: () => 'Click to Start',
    startBtnPlain: () => 'Start As-Is',
    startBtnFreeDos: () => 'Start with FreeDOS(98)',
    toolbarReset: () => 'Reset to Original',
    toolbarFullscreen: () => 'Fullscreen',
    toolbarMachineReset: () => 'Reset Machine',
    toolbarSaveState: () => 'Save State',
    toolbarLoadState: () => 'Load State',
    langToggle: () => '日本語',
    resetConfirm: () =>
      'This will discard your current progress and reset to the original distributed image. Continue?',
    fdSlotLabel: ({ drive }) => `FDD${drive}`,
    hddSlotLabel: () => 'HDD',
    fdEmpty: () => '(empty)',
    fdInsert: () => 'Insert',
    fdInsertFreeDos: () => 'Insert FreeDOS(98)',
    fdEject: () => 'Eject',
    fdCreateBlank: () => 'New Blank',
    slotDownload: () => 'Download',
    statusMachineReset: () => 'Machine reset.',
    statusStateSaved: () => 'State saved.',
    statusStateLoaded: () => 'State loaded.',
    statusFdInserted: ({ drive, name }) => `Inserted into FDD${drive}: ${name}`,
    statusFdEjected: ({ drive }) => `Ejected FDD${drive}.`,
    statusFreeDosInserted: ({ drive }) =>
      `Inserted FreeDOS(98) into FDD${drive}. Reset the machine to boot it.`,
    dropUnsupported: () =>
      'Unsupported file format (HDD: .thd/.hdi/.nhd/.hdd, FD: .d88/.fdi/.xdf/.dup, etc.)',
    dropConfirm: ({ count, names }) => `Loading ${count} file(s): ${names}\nContinue?`,
    diskReplaceUnsupported: () =>
      'Swapping disks after boot is planned for Phase 2. Please reload the page.',
    noMountedImage: () => 'No image is currently mounted.',
    pickSlotPrompt: ({ action, slots }) => `Select a target to ${action}: ${slots}`,
    pickSlotActionReset: () => 'reset',
    statusPreparing: () => 'Preparing to start…',
    statusNoImage: () => 'No image specified. Drag & drop a file to load it.',
    statusCoreBooting: () => 'Starting the core…',
    statusBootSuccess: () => 'Started.',
    statusBootFailed: ({ message }) => `Failed to start: ${message}`,
    statusResumed: ({ label, name }) => `${label}: Resuming from previous session (${name})`,
    statusFetching: ({ label, name }) => `Fetching ${label}: ${name}`,
    statusFetchingProgress: ({ label, name, loaded, total }) =>
      `Fetching ${label}: ${name} (${loaded}${total ? ' / ' + total : ''})`,
    fetchFailedNetwork: ({ url }) =>
      `Failed to fetch image (check network error or CORS settings): ${url}`,
    fetchFailedHttp: ({ url, status }) => `Failed to fetch image (HTTP ${status}): ${url}`,
    audioMuted: () => 'Audio is muted. Click to unmute',
  },
};

function readStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'ja' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** 優先順位: URL ?lang= ＞ localStorage ＞ navigator.language(ja判定) ＞ 既定 'en'。 */
export function resolveLang(): Lang {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl === 'ja' || fromUrl === 'en') return fromUrl;

  const stored = readStoredLang();
  if (stored) return stored;

  if (navigator.language?.toLowerCase().startsWith('ja')) return 'ja';

  return 'en';
}

let currentLang: Lang = resolveLang();

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage が使えない環境ではメモリ上の切替のみ有効。
  }
}

export type StringKey = keyof Dict;

export function t<K extends StringKey>(key: K, ...args: Parameters<Dict[K]>): string {
  const fn = STRINGS[currentLang][key] as (...a: unknown[]) => string;
  return fn(...args);
}
