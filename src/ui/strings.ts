// UI文字列辞書 + 言語解決。日本語/英語を切り替える。
// キーは Dict インターフェースで型定義し、ja/en どちらかにしか無いキーはコンパイルエラーになる。

export type Lang = 'ja' | 'en';

const STORAGE_KEY = 'webnp2.lang';

interface Dict {
  title(): string;
  /** ページフッターの著作権表示ラベル（urara-works.jpへのリンク）。 */
  footerCopyright(): string;
  /** ページフッターの本リポジトリGitHubリンクのラベル。 */
  footerGithubLabel(): string;
  /** ページフッターの「WebNP2について」リンクのラベル（about.htmlへの導線）。 */
  footerAboutLabel(): string;
  /** ツールバーの「使い方」ボタン。help.htmlを別タブで開く。 */
  toolbarHelp(): string;
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
  /** ツールバーの「マウス追従」ボタン。 */
  toolbarMouseResync(): string;
  statusMouseResynced(): string;
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
  /** ツールバーの「ソフトキーボード」ボタン。PC-98配列の仮想キーボードパネルを開閉する。 */
  toolbarVirtualKbd(): string;
  /** テキスト送信バーの入力欄プレースホルダ。 */
  pasteBarPlaceholder(): string;
  pasteBarSetupBtn(): string;
  pasteBarSetupNote(): string;
  statusPasteHelperSetup(): string;
  statusPasteHelperOk(): string;
  statusPasteHelperFailed(args: { message: string }): string;
  /** テキスト送信バーの「Enter付き」チェックボックスのラベル。 */
  pasteBarEnterLabel(): string;
  /** テキスト送信バーの送信ボタン。 */
  pasteBarSend(): string;
  /** テキスト送信バーの閉じるボタン。 */
  pasteBarClose(): string;
  /** テキスト送信完了後、変換できず送れなかった文字があったときのステータス表示。 */
  statusPasteSkipped(args: { count: number; chars: string }): string;

  // --- ファイルマネージャ(FTPクライアント風2ペイン) ---
  /** ツールバーの「ファイル転送」ボタン。 */
  toolbarFileManager(): string;
  fmDialogTitle(): string;
  /** ゲストがフロッピーへアクセス中の転送を避けるよう促す注意書き。 */
  fmDialogNote(): string;
  fmHostPaneTitle(): string;
  fmDiskPaneTitle(): string;
  fmSelectFilesBtn(): string;
  fmDropHint(): string;
  fmStagedEmpty(): string;
  fmArchiveError(args: { name: string; message: string }): string;
  /** ステージング一覧の1件削除ボタン。 */
  fmRemoveBtn(): string;
  fmTransferToDiskBtn(): string;
  fmTransferToHostBtn(): string;
  fmUnmountedLabel(): string;
  fmMountedBadge(): string;
  fmNotEditableNote(): string;
  fmPathRoot(): string;
  fmUpDir(): string;
  /** ディレクトリ行の[DIR]表記。 */
  fmDirMarker(): string;
  fmDeleteSelectedBtn(): string;
  fmMakeDirBtn(): string;
  fmMakeDirPrompt(): string;
  fmMakeDirInvalidName(args: { name: string }): string;
  fmCreateTransferFdBtn(): string;
  fmTransferFdCreated(args: { name: string }): string;
  fmFreeSpaceLabel(args: { free: string; total: string }): string;
  fmSelectEditableTarget(): string;
  fmEmptyDir(): string;
  /** 転送前の8.3名変換確認ダイアログ(元名 → 変換後名の一覧)。 */
  fmRenameConfirm(args: { list: string }): string;
  fmOverwriteConfirm(args: { names: string }): string;
  fmInsufficientSpace(args: { needed: string; free: string }): string;
  fmTransferring(args: { current: number; total: number }): string;
  fmTransferDone(args: { succeeded: number; failed: number }): string;
  fmTransferFailedDetail(args: { names: string }): string;
  fmDeleteConfirm(args: { names: string }): string;
  fmCloseBtn(): string;
  fmListLoadFailed(args: { message: string }): string;
}

const STRINGS: Record<Lang, Dict> = {
  ja: {
    title: () => 'WebNP2 - PC-98 Emulator',
    footerCopyright: () => '© URARA-works',
    footerGithubLabel: () => 'GitHubで見る',
    footerAboutLabel: () => 'WebNP2について',
    toolbarHelp: () => '使い方',
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
    toolbarMouse: () => 'マウスキャプチャ (画面を右ダブルクリックでも開始)',
    statusMouseCaptured: () => 'マウスをキャプチャしました。Esc キーで解除できます。',
    statusMouseReleased: () => 'マウスキャプチャを解除しました。',
    toolbarMouseResync: () => 'マウス再同期 (カーソルがズレたとき)',
    statusMouseResynced: () => 'マウス位置を再同期しました。',
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
    toolbarPasteText: () => 'テキスト送信 (Shiftキー2回でも開く)',
    toolbarVirtualKbd: () => 'ソフトキーボード',
    pasteBarPlaceholder: () => 'ここに送信するテキストを入力…',
    pasteBarSetupBtn: () => '日本語入力を有効化',
    pasteBarSetupNote: () =>
      'このゲストでは全角が届きません。ゲスト常駐ヘルパー(同梱ツールFD)を導入すると全角を送れます。DOSのコマンド待ち状態で実行してください。',
    statusPasteHelperSetup: () => '日本語入力を有効化しています…',
    statusPasteHelperOk: () => '日本語入力を有効化しました。',
    statusPasteHelperFailed: ({ message }) => `日本語入力の有効化に失敗しました: ${message}`,
    pasteBarEnterLabel: () => 'Enter付き',
    pasteBarSend: () => '送信',
    pasteBarClose: () => '閉じる',
    statusPasteSkipped: ({ count, chars }) => `${count}文字を送信できずスキップしました: ${chars}`,
    toolbarFileManager: () => 'ファイル転送',
    fmDialogTitle: () => 'ファイル転送',
    fmDialogNote: () => '注意: ゲストがフロッピーへアクセス中(FDDランプ点灯中)の転送は避けてください。',
    fmHostPaneTitle: () => 'このブラウザ',
    fmDiskPaneTitle: () => 'ディスクイメージ(PC-98側)',
    fmSelectFilesBtn: () => 'ファイルを選択',
    fmDropHint: () => 'ここへファイルをドラッグ＆ドロップできます(.lzh/.zipは自動展開されます)。',
    fmStagedEmpty: () => '追加されたファイルはありません。',
    fmArchiveError: ({ name, message }) => `${name} の展開に失敗しました: ${message}`,
    fmRemoveBtn: () => '削除',
    fmTransferToDiskBtn: () => 'ディスクへ転送 (→)',
    fmTransferToHostBtn: () => 'ホストへ取得 (←)',
    fmUnmountedLabel: () => '未マウント',
    fmMountedBadge: () => 'マウント中',
    fmNotEditableNote: () => '編集非対応',
    fmPathRoot: () => '/ (ルート)',
    fmUpDir: () => '.. 上へ',
    fmDirMarker: () => 'DIR',
    fmDeleteSelectedBtn: () => '選択を削除',
    fmMakeDirBtn: () => '新規フォルダ',
    fmMakeDirPrompt: () => '新規フォルダ名(8.3形式)を入力してください:',
    fmMakeDirInvalidName: ({ name }) => `フォルダ名は8.3形式にしてください(2バイト文字/長い名前は不可): ${name}`,
    fmCreateTransferFdBtn: () => '転送用FDを作成',
    fmTransferFdCreated: ({ name }) => `転送用FD「${name}」を作成しました。`,
    fmFreeSpaceLabel: ({ free, total }) => `空き容量: ${free} / ${total}`,
    fmSelectEditableTarget: () => '編集可能なFDを選択してください(D88/HDDは編集非対応です)。',
    fmEmptyDir: () => '(空のフォルダ)',
    fmRenameConfirm: ({ list }) => `以下のファイル名でディスクへ転送します(8.3形式へ変換済み)。よろしいですか？\n\n${list}`,
    fmOverwriteConfirm: ({ names }) => `同名のファイルを上書きします: ${names}\nよろしいですか？`,
    fmInsufficientSpace: ({ needed, free }) => `空き容量が不足しています(必要: ${needed} / 空き: ${free})。`,
    fmTransferring: ({ current, total }) => `転送中… (${current}/${total})`,
    fmTransferDone: ({ succeeded }) => `${succeeded}件の転送が完了しました。`,
    fmTransferFailedDetail: ({ names }) => `一部の転送に失敗しました: ${names}`,
    fmDeleteConfirm: ({ names }) => `以下のファイルを削除します: ${names}\nよろしいですか？`,
    fmCloseBtn: () => '閉じる',
    fmListLoadFailed: ({ message }) => `一覧の取得に失敗しました: ${message}`,
  },
  en: {
    title: () => 'WebNP2 - PC-98 Emulator',
    footerCopyright: () => '© URARA-works',
    footerGithubLabel: () => 'View on GitHub',
    footerAboutLabel: () => 'About WebNP2',
    toolbarHelp: () => 'Help',
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
    toolbarMouse: () => 'Capture Mouse (or right double-click the screen)',
    statusMouseCaptured: () => 'Mouse captured. Press Esc to release.',
    statusMouseReleased: () => 'Mouse capture released.',
    toolbarMouseResync: () => 'Resync mouse (when the cursor drifts)',
    statusMouseResynced: () => 'Mouse position resynced.',
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
    toolbarPasteText: () => 'Send Text (or double-tap Shift)',
    toolbarVirtualKbd: () => 'On-screen keyboard',
    pasteBarPlaceholder: () => 'Type text to send…',
    pasteBarSetupBtn: () => 'Enable full-width input',
    pasteBarSetupNote: () =>
      'This guest drops full-width characters. Installing the guest helper (bundled tool disk) enables them. Run it at a DOS command prompt.',
    statusPasteHelperSetup: () => 'Enabling full-width input…',
    statusPasteHelperOk: () => 'Full-width input enabled.',
    statusPasteHelperFailed: ({ message }) => `Could not enable full-width input: ${message}`,
    pasteBarEnterLabel: () => 'With Enter',
    pasteBarSend: () => 'Send',
    pasteBarClose: () => 'Close',
    statusPasteSkipped: ({ count, chars }) => `Skipped ${count} unsupported character(s): ${chars}`,
    toolbarFileManager: () => 'File Transfer',
    fmDialogTitle: () => 'File Transfer',
    fmDialogNote: () => 'Note: avoid transferring while the guest is accessing the floppy (FDD light on).',
    fmHostPaneTitle: () => 'This browser',
    fmDiskPaneTitle: () => 'Disk image (PC-98)',
    fmSelectFilesBtn: () => 'Select Files',
    fmDropHint: () => 'You can drag & drop files here (.lzh/.zip are extracted automatically).',
    fmStagedEmpty: () => 'No files added yet.',
    fmArchiveError: ({ name, message }) => `Failed to extract ${name}: ${message}`,
    fmRemoveBtn: () => 'Remove',
    fmTransferToDiskBtn: () => 'Send to Disk (→)',
    fmTransferToHostBtn: () => 'Fetch to Host (←)',
    fmUnmountedLabel: () => 'not mounted',
    fmMountedBadge: () => 'mounted',
    fmNotEditableNote: () => 'not editable',
    fmPathRoot: () => '/ (root)',
    fmUpDir: () => '.. Up',
    fmDirMarker: () => 'DIR',
    fmDeleteSelectedBtn: () => 'Delete Selected',
    fmMakeDirBtn: () => 'New Folder',
    fmMakeDirPrompt: () => 'Enter a new folder name (8.3 format):',
    fmMakeDirInvalidName: ({ name }) => `Folder name must be 8.3 format (no double-byte/long names): ${name}`,
    fmCreateTransferFdBtn: () => 'Create Transfer FD',
    fmTransferFdCreated: ({ name }) => `Created transfer FD "${name}".`,
    fmFreeSpaceLabel: ({ free, total }) => `Free space: ${free} / ${total}`,
    fmSelectEditableTarget: () => 'Select an editable FD (D88/HDD are not supported).',
    fmEmptyDir: () => '(empty folder)',
    fmRenameConfirm: ({ list }) => `These files will be sent to the disk with the following 8.3 names. Continue?\n\n${list}`,
    fmOverwriteConfirm: ({ names }) => `This will overwrite existing file(s): ${names}\nContinue?`,
    fmInsufficientSpace: ({ needed, free }) => `Not enough free space (needed: ${needed} / free: ${free}).`,
    fmTransferring: ({ current, total }) => `Transferring… (${current}/${total})`,
    fmTransferDone: ({ succeeded }) => `${succeeded} file(s) transferred successfully.`,
    fmTransferFailedDetail: ({ names }) => `Some transfers failed: ${names}`,
    fmDeleteConfirm: ({ names }) => `This will delete the following file(s): ${names}\nContinue?`,
    fmCloseBtn: () => 'Close',
    fmListLoadFailed: ({ message }) => `Failed to load listing: ${message}`,
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
