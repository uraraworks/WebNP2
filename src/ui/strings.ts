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
  /** ツールバーの「…」オーバーフローボタンのツールチップ/メニュー見出し。 */
  toolbarMore(): string;
  toolbarGroupInput(): string;
  toolbarGroupSound(): string;
  toolbarGroupDisk(): string;
  toolbarGroupState(): string;
  /** ツールバー「…」内、ミュートON/OFFトグル。 */
  toolbarMute(): string;
  /** ツールバー「…」内、FDDシーク音ON/OFFトグル。 */
  toolbarFddSeekSound(): string;
  /** トグル項目の右端に出すON表示。 */
  toggleOn(): string;
  /** トグル項目の右端に出すOFF表示。 */
  toggleOff(): string;
  overlayNote1(): string;
  overlayNote2(): string;
  startBtn(): string;
  startBtnPlain(): string;
  /** 起動前にディスクをセット済みのときの起動ボタン。 */
  startBtnPending(): string;
  startBtnFreeDos(): string;
  toolbarReset(): string;
  toolbarFullscreen(): string;
  toolbarMachineReset(): string;
  toolbarScreenshot(): string;
  /** ツールバーのポーズボタン(停止中)。 */
  toolbarPause(): string;
  /** ツールバーのポーズボタン(再開させるとき)。 */
  toolbarResume(): string;
  /** ポーズ中オーバーレイの「ポーズ中」ラベル。 */
  pauseOverlayLabel(): string;
  statusScreenshotSaved(): string;
  toolbarMouse(): string;
  statusMouseCaptured(): string;
  statusMouseReleased(): string;
  /** ツールバーの「マウス追従」ボタン。 */
  toolbarMouseResync(): string;
  statusMouseResynced(): string;
  toolbarSaveState(): string;
  toolbarLoadState(): string;
  /** 「…」メニュー内の言語設定行。 */
  toolbarLanguage(): string;
  resetConfirm(): string;
  fdSlotLabel(args: { drive: number }): string;
  hddSlotLabel(): string;
  fdEmpty(): string;
  fdInsert(): string;
  hddInsertSet(): string;
  hddEject(): string;
  /** HDDスロットの「ライブラリからセット」ボタン(起動前のみ)。 */
  hddSetFromLibrary(): string;
  /** 「ライブラリからセット」メニューの見出し。 */
  hddSetFromLibraryTitle(): string;
  /** HDDスロットの「ブランクHDD作成」ボタン(起動前のみ)。 */
  hddCreateBlank(): string;
  fdInsertFreeDos(): string;
  /** ドライブアクセスランプのスクリーンリーダー向けラベル。 */
  diskLampLabel(args: { drive: string }): string;
  /** FDDスロットの「ライブラリから挿入」ボタン(ツールチップ)。 */
  fdInsertFromLibrary(): string;
  /** 「ライブラリから挿入」メニューの見出し。 */
  fdInsertFromLibraryTitle(args: { drive: number }): string;
  fdEject(): string;
  fdCreateBlank(): string;
  slotDownload(): string;
  /** 起動前にFDスロット行へディスクイメージをドロップしたときの案内。 */
  statusMachineReset(): string;
  statusStateSaved(): string;
  statusStateLoaded(): string;
  statusFdInserted(args: { drive: number; name: string }): string;
  statusFdEjected(args: { drive: number }): string;
  statusFreeDosInserted(args: { drive: number }): string;
  dropUnsupported(): string;
  dropConfirm(args: { count: number; names: string }): string;
  diskReplaceUnsupported(): string;
  /** ドロップされたファイル(圧縮ファイル含む)にディスクイメージが1つも無かった場合。 */
  dropNoDiskImage(): string;
  /** 圧縮ファイルの展開に失敗した場合。 */
  statusArchiveFailed(args: { name: string; message: string }): string;
  /** 展開してライブラリへ追加したときの状態表示。 */
  statusLibraryAdded(args: { count: number }): string;
  /** URLパラメータ由来の圧縮ファイルを、前回展開済みのライブラリ内容から復元したときの状態表示。 */
  statusArchiveResumed(args: { label: string; count: number }): string;
  /** URLパラメータ由来の圧縮ファイルにディスクイメージが1つも無かった場合。 */
  statusArchiveNoDiskImage(args: { label: string }): string;
  /** URLパラメータ由来の圧縮ファイルに、指定スロットに合う種別のディスクが1つも無かった場合。 */
  statusArchiveKindMismatch(args: { label: string; kind: 'hdd' | 'fd' }): string;
  /** URLパラメータ由来の圧縮ファイルが複数枚のディスクを含むため、起動を中止してライブラリから選ばせるときの状態表示。 */
  statusArchiveNeedsSelection(): string;
  /** 起動せずスロットへセットしたときの状態表示。 */
  statusDiskSet(args: { name: string }): string;
  /** セット済みディスクを外したときの状態表示。 */
  statusDiskUnset(args: { name: string }): string;
  /** ブランクHDDを作ってセットしたときの状態表示。 */
  statusHddBlankCreated(args: { name: string }): string;
  noMountedImage(): string;
  pickSlotPrompt(args: { action: string; slots: string }): string;
  pickSlotActionReset(): string;
  statusPreparing(): string;
  statusNoImage(): string;
  statusCoreBooting(): string;
  statusBootSuccess(): string;
  statusBootFailed(args: { message: string }): string;
  statusResumed(args: { label: string; name: string }): string;
  /** ?lib=<url> (複数指定可)の取得中/復元時のラベルで使う、何本目のlibか示す表示名(fd1/fd2/hddのラベル相当のlib版)。 */
  urlLibSlotLabel(args: { index: number }): string;
  statusFetching(args: { label: string; name: string }): string;
  statusFetchingProgress(args: {
    label: string;
    name: string;
    loaded: string;
    total: string | null;
  }): string;
  fetchFailedNetwork(args: { url: string }): string;
  fetchFailedHttp(args: { url: string; status: number }): string;
  /** 配信元がOneDrive(1drv.ms/onedrive.live.com/sharepoint.com)だった場合の案内(中継しても取得できないため即座に案内する)。 */
  fetchFailedOneDrive(args: { url: string }): string;
  /**
   * 配信元がGoogle Drive/Dropboxで、かつ中継(VITE_DISK_PROXY)が未設定だった場合の案内。
   * Dropboxは通常ホスト名置換(rewriteDropboxUrl)で直接取得できるため、ここへ来るのは
   * 置換で救えない共有リンク(旧/s/形式・フォルダ共有・パスワード付き)の場合のみ。
   */
  fetchFailedNeedsProxy(args: { url: string }): string;
  /** 中継サーバ経由の取得が失敗した場合のエラーメッセージ本文(中継側のエラーコードを反映)。 */
  fetchFailedProxy(args: { url: string; reason: string }): string;
  /** 取得結果がディスクイメージではなくHTML/XMLページだった場合の案内(共有ページURLの誤指定など)。 */
  fetchFailedHtmlPage(args: { url: string }): string;
  // --- 中継サーバ(VITE_DISK_PROXY)のエラーコード別の理由文言(fetchFailedProxy の reason に渡す) ---
  proxyReasonBadUrl(): string;
  proxyReasonOriginNotAllowed(): string;
  proxyReasonHostNotAllowed(): string;
  proxyReasonTooLarge(): string;
  proxyReasonRateLimited(): string;
  proxyReasonUpstreamFailed(): string;
  proxyReasonRedirectNotAllowed(): string;
  proxyReasonUnknown(args: { status: number }): string;
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
  /** リズム波形WAVがfmgenの受け入れ条件を満たさず登録できなかった場合の一覧文言。 */
  romDialogRejectedNote(args: { items: string }): string;
  rhythmRejectReasonNotRiffWave(): string;
  rhythmRejectReasonNoFmtChunk(): string;
  rhythmRejectReasonNotPcm(): string;
  rhythmRejectReasonNotMono(): string;
  rhythmRejectReasonNoDataChunk(): string;
  rhythmRejectReasonTooManySamples(): string;
  rhythmRejectReasonNot16Bit(): string;
  /** オーバーレイの「保存済みディスクから起動」ボタン。 */
  overlayLibraryBtn(): string;
  toolbarDiskLibrary(): string;
  libraryDialogTitle(): string;
  libraryDialogDescription(): string;
  /** ディスクライブラリダイアログの説明文(D&D取り込み直後、特定グループに注目させる場合)。 */
  libraryGroupFocusHint(): string;
  libraryDialogListEmpty(): string;
  libraryKindHdd(): string;
  libraryKindFd(): string;
  libraryActionBoot(): string;
  /** 起動せずHDDスロットへセットするボタン(起動前のみ)。 */
  libraryActionSetHdd(): string;
  libraryActionInsertFd1(): string;
  libraryActionInsertFd2(): string;
  libraryActionDelete(): string;
  libraryActionNeedsRestart(): string;
  libraryDeleteConfirm(args: { name: string }): string;
  /** ライブラリの表示名変更ボタン。 */
  libraryActionRename(): string;
  /** 表示名変更プロンプト(元のファイル名を併記する)。 */
  libraryRenamePrompt(args: { name: string }): string;
  /** フォルダ(圧縮ファイル由来グループ)の名前変更プロンプト。 */
  libraryRenameGroupPrompt(): string;
  /** フォルダ行に出す枚数表示。 */
  libraryGroupCount(args: { count: number }): string;
  /** フォルダごと削除の確認。 */
  libraryDeleteGroupConfirm(args: { name: string; count: number }): string;
  /** 「ライブラリから挿入」サブメニューの戻る行。 */
  libraryMenuBack(): string;
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

  // --- デバッガ ---
  toolbarDebugger(): string;
  debuggerTitle(): string;
  debuggerPause(): string;
  debuggerResume(): string;
  debuggerStep(): string;
  debuggerStep10(): string;
  debuggerRunToBp(): string;
  debuggerClose(): string;
  debuggerRegisters(): string;
  debuggerDisassembly(): string;
  debuggerMemory(): string;
  debuggerMemoryAddress(): string;
  debuggerMemoryRead(): string;
  debuggerMemoryInvalid(): string;
  debuggerPaused(): string;
  debuggerResumed(): string;
  debuggerStepped(args: { count: number }): string;
  debuggerAddBreakpoint(): string;
  debuggerRemoveBreakpoint(): string;
  debuggerBreakpointAdded(args: { index: number; seg: string; off: string }): string;
  debuggerBreakpointRemoved(args: { seg: string; off: string }): string;
  debuggerBreakpointLimit(): string;
  debuggerBreakpointHit(args: { index: number }): string;
  debuggerBreakpointMiss(): string;

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

  // --- ゲームパッド設定 ---
  /** ツールバーの「ゲームパッド設定」ボタン。 */
  toolbarGamepad(): string;
  gamepadDialogTitle(): string;
  gamepadDialogDescription(): string;
  gamepadDialogClose(): string;
  /** パッド未接続時の案内(Chromeは入力があるまでgetGamepads()に列挙しないため)。 */
  gamepadNoPads(): string;
  gamepadConnectedTitle(): string;
  /** ライブ表示の各パッド見出し(パッド名)。Gamepad API index(0始まり)の生値は出さない。 */
  gamepadLiveTitle(args: { name: string }): string;
  gamepadPhysicalTitle(): string;
  /** ライブ表示右カラム(現在コアへ送っているPC-98キー)の見出し。 */
  gamepadKeysTitle(): string;
  gamepadEditingPadLabel(): string;
  gamepadBindingsTitle(): string;
  /** 割当が1件もないときの一覧表示。 */
  gamepadBindingsEmpty(): string;
  /** 割当済み行の未割当キー表示(検出直後、キーをまだ選んでいない状態)。 */
  gamepadUnassignedKeyLabel(): string;
  /** 行の[クリア]ボタン(そのバインディングを解除)。 */
  gamepadClearBtn(): string;
  gamepadClearBtnTitle(): string;
  /** 行の[再検出]ボタン(割り当てるキーは変えず、物理入力だけ検出し直す)。 */
  gamepadRedetectBtn(): string;
  gamepadRedetectBtnTitle(): string;
  /** 新規の物理入力を検出して行を追加するボタン。 */
  gamepadAddBtn(): string;
  gamepadAddBtnTitle(): string;
  gamepadCancelBtn(): string;
  gamepadCancelBtnTitle(): string;
  gamepadDetectWaiting(): string;
  /** 新規検出が成功し、下のキーボードでキーを選ぶ番になったときの案内。 */
  gamepadPendingPickKey(): string;
  /** 行を選択中、下のキーボードでキーを押すと割り当たることを案内する文言。 */
  gamepadRowSelectedHint(): string;
  /** キーピッカーが無効(押しても意味が無い)状態のときにピッカーの近くへ出す案内。行未選択・検出未開始の初期状態用。 */
  gamepadPickerIdleHint(): string;
  gamepadDeadzoneLabel(): string;
  gamepadKeyPickerTitle(): string;
  /** プリセット適用: カーソルキー+z/x。 */
  gamepadPresetCursorZxBtn(): string;
  gamepadPresetCursorZxBtnTitle(): string;
  /** プリセット適用: テンキー方向+SPACE/ENTER。 */
  gamepadPresetTenkeySpaceBtn(): string;
  gamepadPresetTenkeySpaceBtnTitle(): string;
  gamepadButtonLabel(args: { index: number }): string;
  gamepadAxisLabel(args: { index: number; dir: string }): string;
  gamepadAxisInvalidSuffix(): string;
  /** 未較正の軸(観測開始してから一度も動かされていない)。一度動かせば較正され使えるようになることを短く案内する。 */
  gamepadAxisUncalibratedSuffix(): string;
  /** 較正中(一度動かされて静止値の確定待ち)。押しっぱなしの最中に「使えるようになった」と誤解されないようにする。 */
  gamepadAxisCalibratingSuffix(): string;
  gamepadPositionalButtonLabel(args: { index: number; position: string }): string;
  gamepadPosDown(): string;
  gamepadPosRight(): string;
  gamepadPosLeft(): string;
  gamepadPosUp(): string;
  gamepadPosL(): string;
  gamepadPosR(): string;
  gamepadPosL2(): string;
  gamepadPosR2(): string;
  gamepadPosSelect(): string;
  gamepadPosStart(): string;
  gamepadPosL3(): string;
  gamepadPosR3(): string;
  gamepadPosDpadUp(): string;
  gamepadPosDpadDown(): string;
  gamepadPosDpadLeft(): string;
  gamepadPosDpadRight(): string;
  gamepadPosHome(): string;

  // --- 入力設定ダイアログのタブ切替(ゲームパッド/ホストキー再割り当て) ---
  /** ダイアログ見出し・ツールバーボタンとも、ゲームパッド設定からホストキー再割り当てを含む「入力設定」へ格上げ。 */
  inputSettingsDialogTitle(): string;
  inputTabGamepad(): string;
  inputTabHostkey(): string;
  inputTabVpad(): string;
  inputPanelSwitchKeyboard(): string;
  inputPanelSwitchPad(): string;
  inputPanelSwitchTrackpad(): string;
  /** ソフトキーボード内、テンキーブロックの表示/非表示を切り替えるトグルキーのラベル。 */
  kbdToggleTenkey(): string;
  vpadEditAssignmentsMenuItem(): string;
  vpadDialogDescription(): string;
  vpadProfileLabel(): string;
  vpadProfileCursorZx(): string;
  vpadProfileTenkey(): string;
  vpadNewProfileBtn(): string;
  vpadNewProfilePrompt(): string;
  vpadDuplicateProfileBtn(): string;
  vpadDuplicateProfilePrompt(): string;
  vpadDuplicateDefaultName(args: { name: string }): string;
  vpadRenameProfileBtn(): string;
  vpadRenameProfilePrompt(): string;
  vpadDeleteProfileBtn(): string;
  vpadDeleteProfileConfirm(args: { name: string }): string;
  vpadBuiltinReadonlyNote(): string;
  vpadSourceUp(): string;
  vpadSourceDown(): string;
  vpadSourceLeft(): string;
  vpadSourceRight(): string;
  vpadSourceButton(args: { name: string }): string;
  vpadSourceOption(args: { n: number }): string;
  vpadUnassigned(): string;
  vpadClearBindingBtn(): string;
  vpadPickerIdleHint(): string;
  vpadPendingPickKey(): string;

  // --- ホストキー再割り当て ---
  hostkeyDialogDescription(): string;
  /** ON/OFFスイッチのラベル。 */
  hostkeyEnableLabel(): string;
  /** 組み込みプロファイル「テンキー移動」の表示名。localStorageには入れず表示時にここから引く。 */
  hostkeyBuiltinTenkeyLabel(): string;
  hostkeyProfileLabel(): string;
  hostkeyNewProfileBtn(): string;
  hostkeyNewProfilePrompt(): string;
  hostkeyDuplicateProfileBtn(): string;
  hostkeyDuplicateProfilePrompt(args: { name: string }): string;
  hostkeyDuplicateDefaultName(args: { name: string }): string;
  hostkeyRenameProfileBtn(): string;
  hostkeyRenameProfilePrompt(): string;
  hostkeyDeleteProfileBtn(): string;
  hostkeyDeleteProfileConfirm(args: { name: string }): string;
  profileNameInputLabel(): string;
  profileNameOk(): string;
  profileNameCancel(): string;
  profileNameRequired(): string;
  /** 組み込みプロファイルは読み取り専用であることの案内(編集・削除ボタンの近くに出す)。 */
  hostkeyBuiltinReadonlyNote(): string;
  hostkeyBindingsEmpty(): string;
  hostkeyAddBtn(): string;
  hostkeyAddBtnTitle(): string;
  /** 物理キーの入力待ち中の案内。 */
  hostkeyDetectWaiting(): string;
  /** 物理キーを検出したので、下のキーボードで割り当て先を選ぶ番になったときの案内。 */
  hostkeyPendingPickKey(): string;
  /** キーピッカーが無効(押しても意味が無い)状態のときにピッカーの近くへ出す案内。検出未開始の初期状態用。 */
  hostkeyPickerIdleHint(): string;
  hostkeyClearBtn(): string;
  hostkeyClearBtnTitle(): string;
  hostkeyCancelBtn(): string;
  /** 割り当て一覧などのテキスト表示で、割り当て先がテンキーブロックのキーであることを明示する表記。通常キーの'2'等と区別するため。ソフトキーボード/キーピッカーのボタン表記には使わない(視覚的に分離済みのため)。 */
  tenkeyKeyLabel(args: { key: string }): string;

  // --- ディスク操作エラー(api/fat.ts の DiskError コードに対応) ---
  errD88NotEditable(): string;
  errHddInvalidHeader(args: { format: string }): string;
  errHddNoFatPartition(): string;
  errMountedUseSlotApi(): string;
  errHddEditBeforeBootOnly(): string;
  errHddSlotUnsupported(): string;
  errInvalidShortName(args: { name: string }): string;
}

const STRINGS: Record<Lang, Dict> = {
  ja: {
    title: () => 'WebNP2 - PC-98 Emulator',
    footerCopyright: () => '© URARA-works',
    footerGithubLabel: () => 'GitHubで見る',
    footerAboutLabel: () => 'WebNP2について',
    toolbarHelp: () => '使い方',
    toolbarMore: () => 'その他',
    toolbarGroupInput: () => '入力',
    toolbarGroupSound: () => 'サウンド',
    toolbarGroupDisk: () => 'ディスク',
    toolbarGroupState: () => 'ステート',
    toolbarMute: () => 'ミュート',
    toolbarFddSeekSound: () => 'FDDシーク音',
    toggleOn: () => 'ON',
    toggleOff: () => 'OFF',
    overlayNote1: () => '音声再生の制限上、クリック操作で起動します。',
    overlayNote2: () => 'ファイルをドラッグ&ドロップしてHDD/FDイメージを読み込むこともできます。',
    startBtn: () => 'クリックして起動',
    startBtnPlain: () => 'ディスク無しで起動',
    startBtnPending: () => 'セットしたディスクで起動',
    startBtnFreeDos: () => 'FreeDOS(98) で起動',
    toolbarReset: () => '初期状態に戻す',
    toolbarFullscreen: () => 'フルスクリーン',
    toolbarMachineReset: () => 'マシンリセット',
    toolbarScreenshot: () => 'スクリーンショット',
    toolbarPause: () => 'ポーズ',
    toolbarResume: () => '再開',
    pauseOverlayLabel: () => 'ポーズ中',
    statusScreenshotSaved: () => 'スクリーンショットを保存しました。',
    toolbarMouse: () => 'マウスキャプチャ (画面を右ダブルクリックでも開始)',
    statusMouseCaptured: () => 'マウスをキャプチャしました。Esc キーで解除できます。',
    statusMouseReleased: () => 'マウスキャプチャを解除しました。',
    toolbarMouseResync: () => 'マウス再同期 (カーソルがズレたとき)',
    statusMouseResynced: () => 'マウス位置を再同期しました。',
    toolbarSaveState: () => 'ステート保存',
    toolbarLoadState: () => 'ステート復元',
    toolbarLanguage: () => '言語',
    resetConfirm: () => '現在の進行状況を破棄し、配布元の初期状態に戻します。よろしいですか？',
    fdSlotLabel: ({ drive }) => `FDD${drive}`,
    hddSlotLabel: () => 'HDD',
    fdEmpty: () => '(空)',
    fdInsert: () => '挿入',
    hddInsertSet: () => 'HDDイメージをセット(起動はしない)',
    hddEject: () => 'セットしたHDDを外す',
    hddSetFromLibrary: () => 'ライブラリからセット',
    hddSetFromLibraryTitle: () => 'HDDにセット',
    hddCreateBlank: () => 'ブランクHDDを作成(40MB・FAT16)',
    fdInsertFreeDos: () => 'FreeDOS(98) 挿入',
    diskLampLabel: ({ drive }) => `${drive} アクセスランプ`,
    fdInsertFromLibrary: () => 'ライブラリから挿入',
    fdInsertFromLibraryTitle: ({ drive }) => `FDD${drive} へ挿入`,
    fdEject: () => '排出',
    fdCreateBlank: () => 'ブランクFDを作成(1.2MB・FAT12フォーマット済み)',
    slotDownload: () => 'ダウンロード',
    statusMachineReset: () => 'マシンをリセットしました。',
    statusStateSaved: () => 'ステートを保存しました。',
    statusStateLoaded: () => 'ステートを復元しました。',
    statusFdInserted: ({ drive, name }) => `FDD${drive} に挿入しました: ${name}`,
    statusFdEjected: ({ drive }) => `FDD${drive} を排出しました。`,
    statusFreeDosInserted: ({ drive }) =>
      `FDD${drive} に FreeDOS(98) を挿入しました。マシンリセットで起動します。`,
    dropUnsupported: () =>
      '対応していないファイル形式です（HDD: .thd/.hdi/.nhd/.hdd, FD: .d88/.fdi/.xdf/.dup 等、圧縮: .zip/.lzh）',
    dropNoDiskImage: () => 'ディスクイメージが見つかりませんでした。',
    statusArchiveFailed: ({ name, message }) => `${name} の展開に失敗しました: ${message}`,
    statusLibraryAdded: ({ count }) => `ディスクライブラリに${count}件追加しました。`,
    statusArchiveResumed: ({ label, count }) => `${label}: 前回展開した圧縮ファイルの${count}件を復元しました。`,
    statusArchiveNoDiskImage: ({ label }) => `${label}: 圧縮ファイル内にディスクイメージが見つかりませんでした。`,
    statusArchiveKindMismatch: ({ label, kind }) =>
      `${label}: 圧縮ファイル内に${kind === 'hdd' ? 'HDD' : 'FD'}イメージが見つかりませんでした。`,
    statusArchiveNeedsSelection: () =>
      '圧縮ファイルに複数のディスクが含まれています。ディスクライブラリから使うディスクを選んでください。',
    statusDiskSet: ({ name }) =>
      `${name} をセットしました。起動前ならファイル転送で中身を編集できます。起動ボタンで起動します。`,
    statusDiskUnset: ({ name }) => `${name} を外しました。`,
    statusHddBlankCreated: ({ name }) =>
      `ブランクHDD ${name} を作成してセットしました(40MB・FAT16)。単体では起動できないため、FDからDOSを起動してデータ用ドライブとして使ってください。`,
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
    urlLibSlotLabel: ({ index }) => `ライブラリ${index}`,
    statusFetching: ({ label, name }) => `${label} を取得中: ${name}`,
    statusFetchingProgress: ({ label, name, loaded, total }) =>
      `${label} を取得中: ${name} (${loaded}${total ? ' / ' + total : ''})`,
    fetchFailedNetwork: ({ url }) =>
      `イメージの取得に失敗しました（ネットワークエラーまたはCORS設定を確認してください）: ${url}`,
    fetchFailedHttp: ({ url, status }) => `イメージの取得に失敗しました（HTTP ${status}）: ${url}`,
    fetchFailedOneDrive: ({ url }) =>
      `イメージの取得に失敗しました: ${url}\nOneDriveの共有リンクは仕様上ご利用いただけません。Google DriveかDropboxをお使いください。`,
    fetchFailedNeedsProxy: ({ url }) =>
      `イメージの取得に失敗しました: ${url}\nこの配信元は中継サーバ経由でのみ取得できますが、このビルドでは中継(VITE_DISK_PROXY)が設定されていません。自分でホストしている場合は VITE_DISK_PROXY を設定してください(詳細はREADME)。`,
    fetchFailedProxy: ({ url, reason }) => `イメージの取得に失敗しました: ${url}\n${reason}`,
    fetchFailedHtmlPage: ({ url }) =>
      `取得結果がディスクイメージではなくWebページでした: ${url}\n共有リンクの公開設定(リンクを知っている全員が閲覧可)を確認するか、ダウンロードしたファイルを画面へドラッグ&ドロップしてください。`,
    proxyReasonBadUrl: () => '中継サーバがURLを解釈できませんでした。',
    proxyReasonOriginNotAllowed: () => '中継サーバがこのサイトからのリクエストを許可していません。',
    proxyReasonHostNotAllowed: () => '中継サーバがこの配信元への転送を許可していません。',
    proxyReasonTooLarge: () => 'ファイルサイズが中継サーバの上限を超えています。',
    proxyReasonRateLimited: () => '中継サーバのリクエスト数が上限に達しています。しばらく待って再度お試しください。',
    proxyReasonUpstreamFailed: () => '中継サーバから配信元への取得に失敗しました。',
    proxyReasonRedirectNotAllowed: () =>
      '配信元が別のサイト(ログイン画面など)へ転送しようとしたため中断しました。共有設定が「リンクを知っている全員が閲覧可」になっているか、共有リンクを省略せず全部コピーしているかご確認ください。',
    proxyReasonUnknown: ({ status }) => `中継サーバでエラーが発生しました (HTTP ${status})。`,
    audioMuted: () => '🔇 音声はミュート中です。クリックで有効になります',
    toolbarRomManager: () => 'ROM登録',
    romDialogTitle: () => 'ROM/素材ファイル登録',
    romDialogDescription: () =>
      'デスクトップ版NP2kaiで使っていたROM/素材ファイル(bios.rom, itf.rom, sound.rom, font.rom等)を登録すると、ブラウザ内(IndexedDB)にのみ保存され、次回以降の起動時に自動で組み込まれます。サーバーには送信されません。なお、YM2608リズム音源(2608_*.wav)は代替音を同梱済みのため未登録でも鳴ります(実機のYM2608実チップのリズム音そのものではなく、作者が独自に制作した代替音です)。実機由来の本物をお持ちの場合は2608_*.wavを登録すればそちらが優先されます。',
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
    romDialogRejectedNote: ({ items }) =>
      `登録できませんでした(fmgenが受け付けない形式のまま登録すると、そのファイルだけでなくリズム音源6本すべてが無音になるため、登録自体を中止しました): ${items}`,
    rhythmRejectReasonNotRiffWave: () => 'RIFF/WAVE形式のファイルではありません。',
    rhythmRejectReasonNoFmtChunk: () => '標準的なWAVと構造が異なり、fmtチャンクの位置を認識できません。',
    rhythmRejectReasonNotPcm: () => 'リニアPCM形式ではありません(圧縮WAV等は非対応)。',
    rhythmRejectReasonNotMono: () => 'モノラルのWAVではありません(ステレオ等は非対応)。',
    rhythmRejectReasonNoDataChunk: () => 'dataチャンクが見つかりません。',
    rhythmRejectReasonTooManySamples: () => 'サンプル数が多すぎます(長すぎるWAVです)。',
    rhythmRejectReasonNot16Bit: () => '16bitのリニアPCMではありません。モノラル・16bit・リニアPCMのWAVのみ登録できます。',
    overlayLibraryBtn: () => '保存済みディスクから起動',
    toolbarDiskLibrary: () => 'ディスクライブラリ',
    libraryDialogTitle: () => 'ディスクライブラリ',
    libraryDialogDescription: () =>
      'これまでにブラウザ内(IndexedDB)に保存されたHDD/FDイメージの一覧です。前回の続き(変更後のデータ)がそのまま保存されています。サーバーには送信されません。このダイアログへファイルをドラッグ＆ドロップして登録することもできます。',
    libraryGroupFocusHint: () => '取り込んだ圧縮ファイルの中身です。使うディスクを選んでください。',
    libraryDialogListEmpty: () => '保存済みのディスクイメージはありません。',
    libraryKindHdd: () => 'HDD',
    libraryKindFd: () => 'FD',
    libraryActionBoot: () => '起動',
    libraryActionSetHdd: () => 'HDDにセット',
    libraryActionInsertFd1: () => 'FD1へ挿入',
    libraryActionInsertFd2: () => 'FD2へ挿入',
    libraryActionDelete: () => '削除',
    libraryActionNeedsRestart: () => '起動には再読み込みが必要です',
    libraryDeleteConfirm: ({ name }) => `保存済みデータ「${name}」を削除します。よろしいですか？`,
    libraryActionRename: () => '名前変更',
    libraryRenamePrompt: ({ name }) => `表示名を入力してください（元のファイル名: ${name}）`,
    libraryRenameGroupPrompt: () => 'フォルダ名を入力してください',
    libraryGroupCount: ({ count }) => `${count}枚`,
    libraryDeleteGroupConfirm: ({ name, count }) =>
      `フォルダ「${name}」内の${count}件をすべて削除します。よろしいですか？`,
    libraryMenuBack: () => '← 戻る',
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
    toolbarDebugger: () => 'デバッガ',
    debuggerTitle: () => 'CPUデバッガ',
    debuggerPause: () => '一時停止',
    debuggerResume: () => '再開',
    debuggerStep: () => 'Step (1命令)',
    debuggerStep10: () => 'Step ×10',
    debuggerRunToBp: () => 'BPまで実行',
    debuggerClose: () => '閉じる',
    debuggerRegisters: () => 'レジスタ',
    debuggerDisassembly: () => '逆アセンブル（行をタップしてBP切替）',
    debuggerMemory: () => 'メモリダンプ',
    debuggerMemoryAddress: () => '物理アドレス（16進）',
    debuggerMemoryRead: () => '読み出し',
    debuggerMemoryInvalid: () => 'メモリアドレスを16進数で入力してください。',
    debuggerPaused: () => 'CPUを一時停止しました。',
    debuggerResumed: () => 'CPU実行を再開しました。',
    debuggerStepped: ({ count }) => `${count}命令を実行しました。`,
    debuggerAddBreakpoint: () => 'ブレークポイントを追加',
    debuggerRemoveBreakpoint: () => 'ブレークポイントを解除',
    debuggerBreakpointAdded: ({ index, seg, off }) => `BP${index}: ${seg}:${off} を設定しました。`,
    debuggerBreakpointRemoved: ({ seg, off }) => `${seg}:${off} のBPを解除しました。`,
    debuggerBreakpointLimit: () => 'ブレークポイントは最大8個です。不要なBPを解除してください。',
    debuggerBreakpointHit: ({ index }) => `BP${index} で停止しました。`,
    debuggerBreakpointMiss: () => '100000命令以内にBPへ到達しませんでした。',
    toolbarFileManager: () => 'ファイル転送',
    fmDialogTitle: () => 'ファイル転送',
    fmDialogNote: () =>
      '注意: ゲストがフロッピーへアクセス中(FDDランプ点灯中)の転送は避けてください。HDDイメージは起動前のみ選択できます。',
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
    fmSelectEditableTarget: () =>
      '編集可能なディスクを選択してください(D88は非対応、HDDは起動前のみ編集できます)。',
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
    toolbarGamepad: () => '入力設定(ゲームパッド/キーボード)',
    gamepadDialogTitle: () => 'ゲームパッド設定',
    gamepadDialogDescription: () =>
      '接続中の各パッドについて、ボタン/軸をPC-98のキーへ割り当てます。設定はブラウザにパッドごと保存されます。',
    gamepadDialogClose: () => '閉じる',
    gamepadNoPads: () => 'パッドが検出されていません。パッドのボタンを1回押すと認識されます。',
    gamepadConnectedTitle: () => '接続中のパッド',
    gamepadLiveTitle: ({ name }) => name,
    gamepadPhysicalTitle: () => '物理入力',
    gamepadKeysTitle: () => 'PC-98側キー出力',
    gamepadEditingPadLabel: () => '編集するパッド',
    gamepadBindingsTitle: () => '割当編集',
    gamepadBindingsEmpty: () => '割当はまだありません。下の[新規検出]から追加してください。',
    gamepadUnassignedKeyLabel: () => '(未設定)',
    gamepadClearBtn: () => 'クリア',
    gamepadClearBtnTitle: () => 'この行の割当を解除します',
    gamepadRedetectBtn: () => '再検出',
    gamepadRedetectBtnTitle: () => '次に押した入力へこの行の物理入力を置き換えます(割り当てるキーは変わりません)',
    gamepadAddBtn: () => '新規検出',
    gamepadAddBtnTitle: () => '次に押したボタン/軸を新しい行として追加します',
    gamepadCancelBtn: () => 'キャンセル',
    gamepadCancelBtnTitle: () => '入力待ちを中止して元に戻ります',
    gamepadDetectWaiting: () => '入力を待っています…(Escでキャンセル)',
    gamepadPendingPickKey: () => '検出しました。下のキーボードで割り当てるキーを選んでください。',
    gamepadRowSelectedHint: () => '行を選択中: 下のキーボードでキーを押すと、この行に割り当てます。',
    gamepadPickerIdleHint: () => '割り当てる行を選ぶか、[新規検出]を押してパッドのボタンを押してください。',
    gamepadDeadzoneLabel: () => 'デッドゾーン',
    gamepadKeyPickerTitle: () => 'PC-98キーボード(クリックで選択、送信はされません)',
    gamepadPresetCursorZxBtn: () => 'カーソルキー+Z/X',
    gamepadPresetCursorZxBtnTitle: () => '十字キー/左スティックをカーソルキーへ、A/BをZ/Xへ割り当て直します(既存の割当は消去)',
    gamepadPresetTenkeySpaceBtn: () => 'テンキー+SPACE',
    gamepadPresetTenkeySpaceBtnTitle: () => '十字キー/左スティックをテンキー方向へ、A/BをSPACE/ENTERへ割り当て直します(既存の割当は消去)',
    gamepadButtonLabel: ({ index }) => `ボタン${index}`,
    gamepadAxisLabel: ({ index, dir }) => `軸${index} ${dir}`,
    gamepadAxisInvalidSuffix: () => '(無効・範囲外の値)',
    gamepadAxisUncalibratedSuffix: () => '(未較正・一度動かすと使えます)',
    gamepadAxisCalibratingSuffix: () => '(較正中・そのまま数秒待ってください)',
    gamepadPositionalButtonLabel: ({ index, position }) => `#${index} (${position})`,
    gamepadPosDown: () => '下',
    gamepadPosRight: () => '右',
    gamepadPosLeft: () => '左',
    gamepadPosUp: () => '上',
    gamepadPosL: () => 'L',
    gamepadPosR: () => 'R',
    gamepadPosL2: () => 'L2',
    gamepadPosR2: () => 'R2',
    gamepadPosSelect: () => 'Select',
    gamepadPosStart: () => 'Start',
    gamepadPosL3: () => 'L3',
    gamepadPosR3: () => 'R3',
    gamepadPosDpadUp: () => '十字上',
    gamepadPosDpadDown: () => '十字下',
    gamepadPosDpadLeft: () => '十字左',
    gamepadPosDpadRight: () => '十字右',
    gamepadPosHome: () => 'Home',
    inputSettingsDialogTitle: () => '入力設定',
    inputTabGamepad: () => 'ゲームパッド',
    inputTabHostkey: () => 'キーボード',
    inputTabVpad: () => 'バーチャルパッド',
    inputPanelSwitchKeyboard: () => '仮想キーボードに切替',
    inputPanelSwitchPad: () => 'バーチャルパッドに切替',
    inputPanelSwitchTrackpad: () => 'バーチャルトラックパッドに切替',
    kbdToggleTenkey: () => 'テンキー',
    vpadEditAssignmentsMenuItem: () => '割当を編集',
    vpadDialogDescription: () => '画面上の方向パッドと各ボタンへPC-98キーを割り当てます。組み込み設定は複製して編集してください。',
    vpadProfileLabel: () => 'プロファイル',
    vpadProfileCursorZx: () => 'カーソルキー + Z/X',
    vpadProfileTenkey: () => 'テンキー + Z/X',
    vpadNewProfileBtn: () => '新規',
    vpadNewProfilePrompt: () => '新しいプロファイル名を入力してください:',
    vpadDuplicateProfileBtn: () => '複製',
    vpadDuplicateProfilePrompt: () => '複製後のプロファイル名を入力してください:',
    vpadDuplicateDefaultName: ({ name }) => `${name} のコピー`,
    vpadRenameProfileBtn: () => 'リネーム',
    vpadRenameProfilePrompt: () => '新しいプロファイル名を入力してください:',
    vpadDeleteProfileBtn: () => '削除',
    vpadDeleteProfileConfirm: ({ name }) => `プロファイル「${name}」を削除します。よろしいですか？`,
    vpadBuiltinReadonlyNote: () => '組み込みプロファイルは編集・削除できません。複製すると編集できます。',
    vpadSourceUp: () => '方向 上', vpadSourceDown: () => '方向 下', vpadSourceLeft: () => '方向 左', vpadSourceRight: () => '方向 右',
    vpadSourceButton: ({ name }) => `ボタン ${name}`,
    vpadSourceOption: ({ n }) => `補助ボタン ${n}`,
    vpadUnassigned: () => '(未設定)',
    vpadClearBindingBtn: () => 'クリア',
    vpadPickerIdleHint: () => '編集可能なプロファイルの割当行を選択してください。',
    vpadPendingPickKey: () => '選択中の行へ割り当てるPC-98キーを下から選んでください。',
    hostkeyDialogDescription: () =>
      'ホストPC(実機)のキーをPC-98の任意のキーへ再割り当てします。テンキーの無いノートPC等で、テンキー専用の操作をカーソルキー等から行えるようにするための機能です。',
    hostkeyEnableLabel: () => 'キー再割り当てを有効化',
    hostkeyBuiltinTenkeyLabel: () => 'テンキー移動(矢印キー→テンキー)',
    hostkeyProfileLabel: () => 'プロファイル',
    hostkeyNewProfileBtn: () => '新規',
    hostkeyNewProfilePrompt: () => '新しいプロファイル名を入力してください:',
    hostkeyDuplicateProfileBtn: () => '複製',
    hostkeyDuplicateProfilePrompt: ({ name }) => `「${name}」を複製します。複製後のプロファイル名を入力してください:`,
    hostkeyDuplicateDefaultName: ({ name }) => `${name} のコピー`,
    hostkeyRenameProfileBtn: () => 'リネーム',
    hostkeyRenameProfilePrompt: () => '新しいプロファイル名を入力してください:',
    hostkeyDeleteProfileBtn: () => '削除',
    hostkeyDeleteProfileConfirm: ({ name }) => `プロファイル「${name}」を削除します。よろしいですか？`,
    profileNameInputLabel: () => 'プロファイル名',
    profileNameOk: () => 'OK',
    profileNameCancel: () => 'キャンセル',
    profileNameRequired: () => '空白以外の名前を入力してください。',
    hostkeyBuiltinReadonlyNote: () => '組み込みプロファイルは編集・削除できません(複製してから編集してください)。',
    hostkeyBindingsEmpty: () => '割当はまだありません。下の[追加]から割り当ててください。',
    hostkeyAddBtn: () => '追加',
    hostkeyAddBtnTitle: () => '次に押したホストの物理キーを新しい行として追加します',
    hostkeyDetectWaiting: () => 'ホストのキーを押してください…(Escでキャンセル)',
    hostkeyPendingPickKey: () => '検出しました。下のキーボードで割り当てるPC-98キーを選んでください。',
    hostkeyPickerIdleHint: () => '[追加]を押してホストのキーを押してください。',
    hostkeyClearBtn: () => 'クリア',
    hostkeyClearBtnTitle: () => 'この行の割当を解除します',
    hostkeyCancelBtn: () => 'キャンセル',
    tenkeyKeyLabel: ({ key }) => `テンキー${key}`,
    errD88NotEditable: () => 'D88形式は編集に対応していません。',
    errHddInvalidHeader: ({ format }) => `${format}のヘッダが不正です。`,
    errHddNoFatPartition: () => 'HDDイメージ内にFAT16/12パーティションが見つかりません。',
    errMountedUseSlotApi: () => 'マウント中のイメージはスロット側の操作を使ってください。',
    errHddEditBeforeBootOnly: () => 'HDDイメージの編集は起動前のみ可能です。',
    errHddSlotUnsupported: () => 'この操作はFD1/FD2のみ対応しています(HDDは非対応)。',
    errInvalidShortName: ({ name }) =>
      `ファイル名は8.3形式にしてください(2バイト文字・長い名前は不可): ${name}`,
  },
  en: {
    title: () => 'WebNP2 - PC-98 Emulator',
    footerCopyright: () => '© URARA-works',
    footerGithubLabel: () => 'View on GitHub',
    footerAboutLabel: () => 'About WebNP2',
    toolbarHelp: () => 'Help',
    toolbarMore: () => 'More',
    toolbarGroupInput: () => 'Input',
    toolbarGroupSound: () => 'Sound',
    toolbarGroupDisk: () => 'Disk',
    toolbarGroupState: () => 'State',
    toolbarMute: () => 'Mute',
    toolbarFddSeekSound: () => 'FDD Seek Sound',
    toggleOn: () => 'ON',
    toggleOff: () => 'OFF',
    overlayNote1: () => 'Audio requires a user gesture, so click to start.',
    overlayNote2: () => 'You can also drag & drop HDD/FD disk images.',
    startBtn: () => 'Click to Start',
    startBtnPlain: () => 'Start Without a Disk',
    startBtnPending: () => 'Boot with the Selected Disks',
    startBtnFreeDos: () => 'Start with FreeDOS(98)',
    toolbarReset: () => 'Reset to Original',
    toolbarFullscreen: () => 'Fullscreen',
    toolbarMachineReset: () => 'Reset Machine',
    toolbarScreenshot: () => 'Screenshot',
    toolbarPause: () => 'Pause',
    toolbarResume: () => 'Resume',
    pauseOverlayLabel: () => 'Paused',
    statusScreenshotSaved: () => 'Screenshot saved.',
    toolbarMouse: () => 'Capture Mouse (or right double-click the screen)',
    statusMouseCaptured: () => 'Mouse captured. Press Esc to release.',
    statusMouseReleased: () => 'Mouse capture released.',
    toolbarMouseResync: () => 'Resync mouse (when the cursor drifts)',
    statusMouseResynced: () => 'Mouse position resynced.',
    toolbarSaveState: () => 'Save State',
    toolbarLoadState: () => 'Load State',
    toolbarLanguage: () => 'Language',
    resetConfirm: () =>
      'This will discard your current progress and reset to the original distributed image. Continue?',
    fdSlotLabel: ({ drive }) => `FDD${drive}`,
    hddSlotLabel: () => 'HDD',
    fdEmpty: () => '(empty)',
    fdInsert: () => 'Insert',
    hddInsertSet: () => 'Set HDD image (does not boot)',
    hddEject: () => 'Remove the selected HDD',
    hddSetFromLibrary: () => 'Set from library',
    hddSetFromLibraryTitle: () => 'Set as HDD',
    hddCreateBlank: () => 'Create blank HDD (40MB, FAT16)',
    fdInsertFreeDos: () => 'Insert FreeDOS(98)',
    diskLampLabel: ({ drive }) => `${drive} access lamp`,
    fdInsertFromLibrary: () => 'Insert from library',
    fdInsertFromLibraryTitle: ({ drive }) => `Insert into FDD${drive}`,
    fdEject: () => 'Eject',
    fdCreateBlank: () => 'Create blank FD (1.2MB, FAT12 formatted)',
    slotDownload: () => 'Download',
    statusMachineReset: () => 'Machine reset.',
    statusStateSaved: () => 'State saved.',
    statusStateLoaded: () => 'State loaded.',
    statusFdInserted: ({ drive, name }) => `Inserted into FDD${drive}: ${name}`,
    statusFdEjected: ({ drive }) => `Ejected FDD${drive}.`,
    statusFreeDosInserted: ({ drive }) =>
      `Inserted FreeDOS(98) into FDD${drive}. Reset the machine to boot it.`,
    dropUnsupported: () =>
      'Unsupported file format (HDD: .thd/.hdi/.nhd/.hdd, FD: .d88/.fdi/.xdf/.dup, archives: .zip/.lzh)',
    dropNoDiskImage: () => 'No disk image was found.',
    statusArchiveFailed: ({ name, message }) => `Failed to extract ${name}: ${message}`,
    statusLibraryAdded: ({ count }) => `Added ${count} image(s) to the disk library.`,
    statusArchiveResumed: ({ label, count }) =>
      `${label}: Resumed ${count} image(s) from the previously extracted archive.`,
    statusArchiveNoDiskImage: ({ label }) => `${label}: No disk image found inside the archive.`,
    statusArchiveKindMismatch: ({ label, kind }) =>
      `${label}: No ${kind === 'hdd' ? 'HDD' : 'FD'} image found inside the archive.`,
    statusArchiveNeedsSelection: () =>
      'The archive contains multiple disks. Please choose one from the disk library.',
    statusDiskSet: ({ name }) =>
      `Set ${name}. You can edit its contents via file transfer before boot. Press the boot button to start.`,
    statusDiskUnset: ({ name }) => `Removed ${name}.`,
    statusHddBlankCreated: ({ name }) =>
      `Created and set blank HDD ${name} (40MB, FAT16). It is not bootable on its own — boot DOS from a floppy and use it as a data drive.`,
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
    urlLibSlotLabel: ({ index }) => `Library ${index}`,
    statusFetching: ({ label, name }) => `Fetching ${label}: ${name}`,
    statusFetchingProgress: ({ label, name, loaded, total }) =>
      `Fetching ${label}: ${name} (${loaded}${total ? ' / ' + total : ''})`,
    fetchFailedNetwork: ({ url }) =>
      `Failed to fetch image (check network error or CORS settings): ${url}`,
    fetchFailedHttp: ({ url, status }) => `Failed to fetch image (HTTP ${status}): ${url}`,
    fetchFailedOneDrive: ({ url }) =>
      `Failed to fetch image: ${url}\nOneDrive share links can't be used due to OneDrive's own restrictions. Please use Google Drive or Dropbox instead.`,
    fetchFailedNeedsProxy: ({ url }) =>
      `Failed to fetch image: ${url}\nThis source can only be fetched through the relay server, but this build has no relay (VITE_DISK_PROXY) configured. If you're hosting this yourself, set VITE_DISK_PROXY (see the README for details).`,
    fetchFailedProxy: ({ url, reason }) => `Failed to fetch image: ${url}\n${reason}`,
    fetchFailedHtmlPage: ({ url }) =>
      `The result was a web page, not a disk image: ${url}\nCheck that the share link is set to "Anyone with the link" can view, or drag & drop the downloaded file onto the page instead.`,
    proxyReasonBadUrl: () => 'The relay server could not parse the URL.',
    proxyReasonOriginNotAllowed: () => 'The relay server does not allow requests from this site.',
    proxyReasonHostNotAllowed: () => 'The relay server does not allow forwarding to this source.',
    proxyReasonTooLarge: () => "The file exceeds the relay server's size limit.",
    proxyReasonRateLimited: () => 'The relay server rate limit was reached. Please try again later.',
    proxyReasonUpstreamFailed: () => 'The relay server failed to fetch from the source.',
    proxyReasonRedirectNotAllowed: () =>
      'The source tried to redirect to another site (e.g. a login page), so the request was blocked. Check that sharing is set to "Anyone with the link" and that you copied the full share link.',
    proxyReasonUnknown: ({ status }) => `The relay server returned an error (HTTP ${status}).`,
    audioMuted: () => 'Audio is muted. Click to unmute',
    toolbarRomManager: () => 'ROM Files',
    romDialogTitle: () => 'Register ROM/Asset Files',
    romDialogDescription: () =>
      'Register the ROM/asset files you use with the desktop NP2kai (bios.rom, itf.rom, sound.rom, font.rom, etc.). They are saved only in your browser (IndexedDB) and automatically loaded on future starts. Nothing is sent to any server. YM2608 rhythm samples (2608_*.wav) already work without registering anything, since a substitute set is bundled (it is not the real YM2608 chip\'s rhythm sound, but an alternative crafted by its author). If you have the real thing, registering 2608_*.wav will take priority over the bundled substitute.',
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
    romDialogRejectedNote: ({ items }) =>
      `Not registered (fmgen cannot load this format, and registering it as-is would silence not just this file but all 6 rhythm samples, so registration was cancelled): ${items}`,
    rhythmRejectReasonNotRiffWave: () => 'Not a RIFF/WAVE file.',
    rhythmRejectReasonNoFmtChunk: () => "Structure differs from a standard WAV; can't locate the fmt chunk.",
    rhythmRejectReasonNotPcm: () => 'Not linear PCM (compressed WAV is unsupported).',
    rhythmRejectReasonNotMono: () => 'Not a mono WAV (stereo etc. is unsupported).',
    rhythmRejectReasonNoDataChunk: () => 'No data chunk found.',
    rhythmRejectReasonTooManySamples: () => 'Too many samples (the WAV is too long).',
    rhythmRejectReasonNot16Bit: () =>
      'Not 16-bit linear PCM. Only mono, 16-bit, linear PCM WAV files can be registered.',
    overlayLibraryBtn: () => 'Boot from Saved Disk',
    toolbarDiskLibrary: () => 'Disk Library',
    libraryDialogTitle: () => 'Disk Library',
    libraryDialogDescription: () =>
      'These are the HDD/FD disk images previously saved in your browser (IndexedDB), including your progress. Nothing is sent to any server. You can also drag & drop files onto this dialog to register them.',
    libraryGroupFocusHint: () => 'Contents of the imported archive. Choose a disk to use.',
    libraryDialogListEmpty: () => 'No saved disk images yet.',
    libraryKindHdd: () => 'HDD',
    libraryKindFd: () => 'FD',
    libraryActionBoot: () => 'Boot',
    libraryActionSetHdd: () => 'Set as HDD',
    libraryActionInsertFd1: () => 'Insert into FD1',
    libraryActionInsertFd2: () => 'Insert into FD2',
    libraryActionDelete: () => 'Delete',
    libraryActionNeedsRestart: () => 'Reload the page to boot from this',
    libraryDeleteConfirm: ({ name }) => `This will delete the saved data "${name}". Continue?`,
    libraryActionRename: () => 'Rename',
    libraryRenamePrompt: ({ name }) => `Enter a display name (original file name: ${name})`,
    libraryRenameGroupPrompt: () => 'Enter a folder name',
    libraryGroupCount: ({ count }) => `${count} disk(s)`,
    libraryDeleteGroupConfirm: ({ name, count }) =>
      `This will delete all ${count} image(s) in the folder "${name}". Continue?`,
    libraryMenuBack: () => '← Back',
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
    toolbarDebugger: () => 'Debugger',
    debuggerTitle: () => 'CPU Debugger',
    debuggerPause: () => 'Pause',
    debuggerResume: () => 'Resume',
    debuggerStep: () => 'Step (1 instruction)',
    debuggerStep10: () => 'Step ×10',
    debuggerRunToBp: () => 'Run to BP',
    debuggerClose: () => 'Close',
    debuggerRegisters: () => 'Registers',
    debuggerDisassembly: () => 'Disassembly (tap a line to toggle BP)',
    debuggerMemory: () => 'Memory dump',
    debuggerMemoryAddress: () => 'Physical address (hex)',
    debuggerMemoryRead: () => 'Read',
    debuggerMemoryInvalid: () => 'Enter a hexadecimal memory address.',
    debuggerPaused: () => 'CPU paused.',
    debuggerResumed: () => 'CPU resumed.',
    debuggerStepped: ({ count }) => `Executed ${count} instruction(s).`,
    debuggerAddBreakpoint: () => 'Add breakpoint',
    debuggerRemoveBreakpoint: () => 'Remove breakpoint',
    debuggerBreakpointAdded: ({ index, seg, off }) => `Set BP${index} at ${seg}:${off}.`,
    debuggerBreakpointRemoved: ({ seg, off }) => `Removed BP at ${seg}:${off}.`,
    debuggerBreakpointLimit: () => 'The maximum of 8 breakpoints is already in use.',
    debuggerBreakpointHit: ({ index }) => `Stopped at BP${index}.`,
    debuggerBreakpointMiss: () => 'No breakpoint reached within 100000 instructions.',
    toolbarFileManager: () => 'File Transfer',
    fmDialogTitle: () => 'File Transfer',
    fmDialogNote: () =>
      'Note: avoid transferring while the guest is accessing the floppy (FDD light on). HDD images can only be selected before boot.',
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
    fmSelectEditableTarget: () =>
      'Select an editable disk (D88 is unsupported; HDD images can only be edited before boot).',
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
    toolbarGamepad: () => 'Input Settings (Gamepad/Keyboard)',
    gamepadDialogTitle: () => 'Gamepad Settings',
    gamepadDialogDescription: () =>
      'Assign buttons/axes on each connected gamepad to PC-98 keys. Settings are saved in your browser, per pad.',
    gamepadDialogClose: () => 'Close',
    gamepadNoPads: () => 'No pad detected. Press any button on the pad once to have it recognized.',
    gamepadConnectedTitle: () => 'Connected Pads',
    gamepadLiveTitle: ({ name }) => name,
    gamepadPhysicalTitle: () => 'Physical Input',
    gamepadKeysTitle: () => 'PC-98 Key Output',
    gamepadEditingPadLabel: () => 'Editing Pad',
    gamepadBindingsTitle: () => 'Edit Assignment',
    gamepadBindingsEmpty: () => 'No assignments yet. Use [Add] below to create one.',
    gamepadUnassignedKeyLabel: () => '(unset)',
    gamepadClearBtn: () => 'Clear',
    gamepadClearBtnTitle: () => 'Remove this row\'s assignment',
    gamepadRedetectBtn: () => 'Redetect',
    gamepadRedetectBtnTitle: () => 'Replaces this row\'s physical input with the next one you press (the assigned key stays the same)',
    gamepadAddBtn: () => 'Add',
    gamepadAddBtnTitle: () => 'Adds a new row for the next button/axis you press',
    gamepadCancelBtn: () => 'Cancel',
    gamepadCancelBtnTitle: () => 'Stops waiting for input and returns to normal',
    gamepadDetectWaiting: () => 'Waiting for input… (Esc to cancel)',
    gamepadPendingPickKey: () => 'Detected. Pick the key to assign on the keyboard below.',
    gamepadRowSelectedHint: () => 'Row selected: press a key on the keyboard below to assign it to this row.',
    gamepadPickerIdleHint: () => 'Select a row to assign, or press [Detect New] and then press a button on the pad.',
    gamepadDeadzoneLabel: () => 'Deadzone',
    gamepadKeyPickerTitle: () => 'PC-98 keyboard (click to select, no keys are sent)',
    gamepadPresetCursorZxBtn: () => 'Cursor Keys + Z/X',
    gamepadPresetCursorZxBtnTitle: () => 'Reassigns the D-Pad/left stick to cursor keys and A/B to Z/X (clears existing assignments)',
    gamepadPresetTenkeySpaceBtn: () => 'Numpad + SPACE',
    gamepadPresetTenkeySpaceBtnTitle: () => 'Reassigns the D-Pad/left stick to numpad directions and A/B to SPACE/ENTER (clears existing assignments)',
    gamepadButtonLabel: ({ index }) => `Button ${index}`,
    gamepadAxisLabel: ({ index, dir }) => `Axis ${index} ${dir}`,
    gamepadAxisInvalidSuffix: () => '(invalid, out of range)',
    gamepadAxisUncalibratedSuffix: () => '(not calibrated yet — move it once to use)',
    gamepadAxisCalibratingSuffix: () => '(calibrating — please wait a few seconds)',
    gamepadPositionalButtonLabel: ({ index, position }) => `#${index} (${position})`,
    gamepadPosDown: () => 'Down',
    gamepadPosRight: () => 'Right',
    gamepadPosLeft: () => 'Left',
    gamepadPosUp: () => 'Up',
    gamepadPosL: () => 'L',
    gamepadPosR: () => 'R',
    gamepadPosL2: () => 'L2',
    gamepadPosR2: () => 'R2',
    gamepadPosSelect: () => 'Select',
    gamepadPosStart: () => 'Start',
    gamepadPosL3: () => 'L3',
    gamepadPosR3: () => 'R3',
    gamepadPosDpadUp: () => 'D-Pad Up',
    gamepadPosDpadDown: () => 'D-Pad Down',
    gamepadPosDpadLeft: () => 'D-Pad Left',
    gamepadPosDpadRight: () => 'D-Pad Right',
    gamepadPosHome: () => 'Home',
    inputSettingsDialogTitle: () => 'Input Settings',
    inputTabGamepad: () => 'Gamepad',
    inputTabHostkey: () => 'Keyboard',
    inputTabVpad: () => 'Virtual Pad',
    inputPanelSwitchKeyboard: () => 'Switch to virtual keyboard',
    inputPanelSwitchPad: () => 'Switch to virtual pad',
    inputPanelSwitchTrackpad: () => 'Switch to virtual trackpad',
    kbdToggleTenkey: () => 'Numpad',
    vpadEditAssignmentsMenuItem: () => 'Edit assignments',
    vpadDialogDescription: () => 'Assign PC-98 keys to the on-screen direction pad and buttons. Duplicate a built-in profile to edit it.',
    vpadProfileLabel: () => 'Profile',
    vpadProfileCursorZx: () => 'Cursor Keys + Z/X',
    vpadProfileTenkey: () => 'Tenkey + Z/X',
    vpadNewProfileBtn: () => 'New',
    vpadNewProfilePrompt: () => 'Enter a name for the new profile:',
    vpadDuplicateProfileBtn: () => 'Duplicate',
    vpadDuplicateProfilePrompt: () => 'Enter a name for the duplicated profile:',
    vpadDuplicateDefaultName: ({ name }) => `${name} copy`,
    vpadRenameProfileBtn: () => 'Rename',
    vpadRenameProfilePrompt: () => 'Enter a new profile name:',
    vpadDeleteProfileBtn: () => 'Delete',
    vpadDeleteProfileConfirm: ({ name }) => `Delete profile "${name}"?`,
    vpadBuiltinReadonlyNote: () => 'Built-in profiles cannot be edited or deleted. Duplicate one to edit it.',
    vpadSourceUp: () => 'Direction Up', vpadSourceDown: () => 'Direction Down', vpadSourceLeft: () => 'Direction Left', vpadSourceRight: () => 'Direction Right',
    vpadSourceButton: ({ name }) => `Button ${name}`,
    vpadSourceOption: ({ n }) => `Option ${n}`,
    vpadUnassigned: () => '(unset)',
    vpadClearBindingBtn: () => 'Clear',
    vpadPickerIdleHint: () => 'Select a binding row in an editable profile.',
    vpadPendingPickKey: () => 'Pick the PC-98 key to assign to the selected row below.',
    hostkeyDialogDescription: () =>
      'Remap physical keys on your host PC to any PC-98 key. Useful on laptops without a numeric keypad, so tenkey-only controls can be driven from e.g. the arrow keys.',
    hostkeyEnableLabel: () => 'Enable key remapping',
    hostkeyBuiltinTenkeyLabel: () => 'Tenkey Movement (Arrows → Tenkey)',
    hostkeyProfileLabel: () => 'Profile',
    hostkeyNewProfileBtn: () => 'New',
    hostkeyNewProfilePrompt: () => 'Enter a name for the new profile:',
    hostkeyDuplicateProfileBtn: () => 'Duplicate',
    hostkeyDuplicateProfilePrompt: ({ name }) => `Duplicating "${name}". Enter a name for the copy:`,
    hostkeyDuplicateDefaultName: ({ name }) => `${name} copy`,
    hostkeyRenameProfileBtn: () => 'Rename',
    hostkeyRenameProfilePrompt: () => 'Enter a new name for the profile:',
    hostkeyDeleteProfileBtn: () => 'Delete',
    hostkeyDeleteProfileConfirm: ({ name }) => `Delete profile "${name}"? This cannot be undone.`,
    profileNameInputLabel: () => 'Profile name',
    profileNameOk: () => 'OK',
    profileNameCancel: () => 'Cancel',
    profileNameRequired: () => 'Enter a name containing non-whitespace characters.',
    hostkeyBuiltinReadonlyNote: () => 'Built-in profiles cannot be edited or deleted (duplicate it first).',
    hostkeyBindingsEmpty: () => 'No bindings yet. Use [Add] below to add one.',
    hostkeyAddBtn: () => 'Add',
    hostkeyAddBtnTitle: () => 'Adds a new row for the next physical key you press on the host',
    hostkeyDetectWaiting: () => 'Press a key on the host…(Esc to cancel)',
    hostkeyPendingPickKey: () => 'Detected. Now pick the PC-98 key to assign it to, below.',
    hostkeyPickerIdleHint: () => 'Press [Add], then press a key on the host keyboard.',
    hostkeyClearBtn: () => 'Clear',
    hostkeyClearBtnTitle: () => 'Clears the binding for this row',
    hostkeyCancelBtn: () => 'Cancel',
    tenkeyKeyLabel: ({ key }) => `Tenkey ${key}`,
    errD88NotEditable: () => 'The D88 format is not supported for editing.',
    errHddInvalidHeader: ({ format }) => `Invalid ${format} header.`,
    errHddNoFatPartition: () => 'No FAT16/12 partition was found in this HDD image.',
    errMountedUseSlotApi: () => 'This image is mounted — use the slot controls instead.',
    errHddEditBeforeBootOnly: () => 'HDD images can only be edited before boot.',
    errHddSlotUnsupported: () => 'This operation supports FD1/FD2 only (not HDD).',
    errInvalidShortName: ({ name }) =>
      `File names must be in 8.3 form (no double-byte or long names): ${name}`,
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

// モジュール読み込み時ではなく初回参照時に解決する(遅延初期化)。webnp2.ts が
// disk-fetch.ts 経由でこのモジュールに依存するようになったため、location/localStorage/
// navigator の無いNode環境(vitestのnode environment)でこのモジュールをimportしただけで
// 落ちないようにする必要がある。
let currentLang: Lang | null = null;

export function getLang(): Lang {
  if (currentLang === null) {
    currentLang = resolveLang();
  }
  return currentLang;
}

/** 設定値として表示する言語名。UI言語に翻訳せず、その言語自身の名前を返す。 */
export function langSelfName(lang: Lang): string {
  return lang === 'ja' ? '日本語' : 'English';
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
  const fn = STRINGS[getLang()][key] as (...a: unknown[]) => string;
  return fn(...args);
}

/**
 * 例外を利用者向けのメッセージへ変換する。
 * api/fat.ts の DiskError はコードを持つので現在の言語の文言へ差し替え、
 * それ以外(内部エラー)は素のメッセージをそのまま返す。
 * fat.ts を import せず、コードの有無をダックタイピングで判定して依存を作らない。
 */
export function describeError(err: unknown): string {
  if (err instanceof Error && 'code' in err) {
    const code = (err as Error & { code: unknown }).code;
    const params = ((err as Error & { params?: unknown }).params ?? {}) as {
      format: string;
      name: string;
    };
    switch (code) {
      case 'd88NotEditable':
        return t('errD88NotEditable');
      case 'hddInvalidHeader':
        return t('errHddInvalidHeader', params);
      case 'hddNoFatPartition':
        return t('errHddNoFatPartition');
      case 'mountedUseSlotApi':
        return t('errMountedUseSlotApi');
      case 'hddEditBeforeBootOnly':
        return t('errHddEditBeforeBootOnly');
      case 'hddSlotUnsupported':
        return t('errHddSlotUnsupported');
      case 'invalidShortName':
        return t('errInvalidShortName', params);
      default:
        break;
    }
  }
  return err instanceof Error ? err.message : String(err);
}
