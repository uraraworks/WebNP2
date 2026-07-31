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
  toolbarScreenshot(): string;
  statusScreenshotSaved(): string;
  toolbarMouse(): string;
  statusMouseCaptured(): string;
  statusMouseReleased(): string;
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
  /** 起動前にFDスロット行へディスクイメージをドロップしたときの案内。 */
  slotDropNotBooted(): string;
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
  toolbarRomManager(): string;
  romDialogTitle(): string;
  romDialogDescription(): string;
  romDialogSelectFiles(): string;
  romDialogDropHint(): string;
  romDialogListEmpty(): string;
  romDialogDelete(): string;
  romDialogReloadNote(): string;
  romDialogReloadBtn(): string;
  romDialogClose(): string;
  romDialogSaved(args: { saved: number; skipped: number }): string;
  romDialogSkippedNote(args: { names: string }): string;
  /** オーバーレイの「保存済みディスクから起動」ボタン。 */
  overlayLibraryBtn(): string;
  toolbarDiskLibrary(): string;
  libraryDialogTitle(): string;
  libraryDialogDescription(): string;
  libraryDialogListEmpty(): string;
  libraryKindHdd(): string;
  libraryKindFd(): string;
  libraryActionBoot(): string;
  libraryActionBootFd1(): string;
  libraryActionInsertFd1(): string;
  libraryActionInsertFd2(): string;
  libraryActionDelete(): string;
  libraryActionNeedsRestart(): string;
  libraryDeleteConfirm(args: { name: string }): string;
  libraryDialogClose(): string;
  /** ツールバーの「テキスト送信」ボタン。全角対応のホスト側テキスト送信バーを開く。 */
  toolbarPasteText(): string;
  /** テキスト送信バーの入力欄プレースホルダ。 */
  pasteBarPlaceholder(): string;
  /** テキスト送信バーの「Enter付き」チェックボックスのラベル。 */
  pasteBarEnterLabel(): string;
  /** テキスト送信バーの送信ボタン。 */
  pasteBarSend(): string;
  /** テキスト送信バーの閉じるボタン。 */
  pasteBarClose(): string;
  /** テキスト送信完了後、変換できず送れなかった文字があったときのステータス表示。 */
  statusPasteSkipped(args: { count: number; chars: string }): string;
}

const STRINGS: Record<Lang, Dict> = {
  ja: {
    title: () => 'WebNP2 - PC-98 Emulator',
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
    toolbarScreenshot: () => 'スクリーンショット',
    statusScreenshotSaved: () => 'スクリーンショットを保存しました。',
    toolbarMouse: () => 'マウスキャプチャ',
    statusMouseCaptured: () => 'マウスをキャプチャしました。Esc キーで解除できます。',
    statusMouseReleased: () => 'マウスキャプチャを解除しました。',
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
    slotDropNotBooted: () => '先にエミュレータを起動してください。起動後にドロップで挿入できます。',
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
    toolbarRomManager: () => 'ROM登録',
    romDialogTitle: () => 'ROM/素材ファイル登録',
    romDialogDescription: () =>
      'デスクトップ版NP2kaiで使っていたROM/素材ファイル(bios.rom, itf.rom, sound.rom, font.rom, 2608_*.wav 等)を登録すると、ブラウザ内(IndexedDB)にのみ保存され、次回以降の起動時に自動で組み込まれます。サーバーには送信されません。',
    romDialogSelectFiles: () => 'ファイルを選択',
    romDialogDropHint: () => 'このダイアログへファイルをドラッグ＆ドロップしても登録できます。',
    romDialogListEmpty: () => '登録済みのファイルはありません。',
    romDialogDelete: () => '削除',
    romDialogReloadNote: () => '反映には再起動(ページのリロード)が必要です。',
    romDialogReloadBtn: () => 'ページを再読み込み',
    romDialogClose: () => '閉じる',
    romDialogSaved: ({ saved, skipped }) =>
      `${saved}件のファイルを登録しました。${skipped > 0 ? `(${skipped}件は非対応形式のためスキップ)` : ''}`,
    romDialogSkippedNote: ({ names }) => `非対応のためスキップ: ${names}`,
    overlayLibraryBtn: () => '保存済みディスクから起動',
    toolbarDiskLibrary: () => 'ディスクライブラリ',
    libraryDialogTitle: () => 'ディスクライブラリ',
    libraryDialogDescription: () =>
      'これまでにブラウザ内(IndexedDB)に保存されたHDD/FDイメージの一覧です。前回の続き(変更後のデータ)がそのまま保存されています。サーバーには送信されません。',
    libraryDialogListEmpty: () => '保存済みのディスクイメージはありません。',
    libraryKindHdd: () => 'HDD',
    libraryKindFd: () => 'FD',
    libraryActionBoot: () => '起動',
    libraryActionBootFd1: () => 'FD1で起動',
    libraryActionInsertFd1: () => 'FD1へ挿入',
    libraryActionInsertFd2: () => 'FD2へ挿入',
    libraryActionDelete: () => '削除',
    libraryActionNeedsRestart: () => '起動には再読み込みが必要です',
    libraryDeleteConfirm: ({ name }) => `保存済みデータ「${name}」を削除します。よろしいですか？`,
    libraryDialogClose: () => '閉じる',
    toolbarPasteText: () => 'テキスト送信',
    pasteBarPlaceholder: () => 'ここに送信するテキストを入力(全角可)…',
    pasteBarEnterLabel: () => 'Enter付き',
    pasteBarSend: () => '送信',
    pasteBarClose: () => '閉じる',
    statusPasteSkipped: ({ count, chars }) => `${count}文字を送信できずスキップしました: ${chars}`,
  },
  en: {
    title: () => 'WebNP2 - PC-98 Emulator',
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
    toolbarScreenshot: () => 'Screenshot',
    statusScreenshotSaved: () => 'Screenshot saved.',
    toolbarMouse: () => 'Capture Mouse',
    statusMouseCaptured: () => 'Mouse captured. Press Esc to release.',
    statusMouseReleased: () => 'Mouse capture released.',
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
    slotDropNotBooted: () => 'Boot the emulator first, then drop a disk image here to insert it.',
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
    toolbarRomManager: () => 'ROM Files',
    romDialogTitle: () => 'Register ROM/Asset Files',
    romDialogDescription: () =>
      'Register the ROM/asset files you use with the desktop NP2kai (bios.rom, itf.rom, sound.rom, font.rom, 2608_*.wav, etc.). They are saved only in your browser (IndexedDB) and automatically loaded on future starts. Nothing is sent to any server.',
    romDialogSelectFiles: () => 'Select Files',
    romDialogDropHint: () => 'You can also drag & drop files onto this dialog to register them.',
    romDialogListEmpty: () => 'No files registered yet.',
    romDialogDelete: () => 'Delete',
    romDialogReloadNote: () => 'Reload the page for changes to take effect.',
    romDialogReloadBtn: () => 'Reload Page',
    romDialogClose: () => 'Close',
    romDialogSaved: ({ saved, skipped }) =>
      `Registered ${saved} file(s).${skipped > 0 ? ` (${skipped} skipped as unsupported)` : ''}`,
    romDialogSkippedNote: ({ names }) => `Skipped unsupported files: ${names}`,
    overlayLibraryBtn: () => 'Boot from Saved Disk',
    toolbarDiskLibrary: () => 'Disk Library',
    libraryDialogTitle: () => 'Disk Library',
    libraryDialogDescription: () =>
      'These are the HDD/FD disk images previously saved in your browser (IndexedDB), including your progress. Nothing is sent to any server.',
    libraryDialogListEmpty: () => 'No saved disk images yet.',
    libraryKindHdd: () => 'HDD',
    libraryKindFd: () => 'FD',
    libraryActionBoot: () => 'Boot',
    libraryActionBootFd1: () => 'Boot with FD1',
    libraryActionInsertFd1: () => 'Insert into FD1',
    libraryActionInsertFd2: () => 'Insert into FD2',
    libraryActionDelete: () => 'Delete',
    libraryActionNeedsRestart: () => 'Reload the page to boot from this',
    libraryDeleteConfirm: ({ name }) => `This will delete the saved data "${name}". Continue?`,
    libraryDialogClose: () => 'Close',
    toolbarPasteText: () => 'Send Text',
    pasteBarPlaceholder: () => 'Type text to send (full-width OK)…',
    pasteBarEnterLabel: () => 'With Enter',
    pasteBarSend: () => 'Send',
    pasteBarClose: () => 'Close',
    statusPasteSkipped: ({ count, chars }) => `Skipped ${count} unsupported character(s): ${chars}`,
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
