// ツールバー「…」オーバーフローメニューの純粋ロジック。
// DOM/文言(strings.ts)に依存しない部分だけをここへ切り出し、player.ts(DOM構築)側は
// この結果をDOMへ反映するだけに留める(gamepad-ui.tsのgamepadPickerAvailability()と同じ流儀)。
// 移植元: WebX68k commit 694bd3f「4:3表示モードとツールバーのオーバーフローメニューを追加」。
// WebX68kはmain.ts内に直接書いていたが、WebNP2側はDOM依存のplayer.tsが既に大きいため、
// テスト対象を明確にする目的で専用ファイルへ切り出した(kbd-layout.tsと同じ切り出し方)。

/**
 * ツールバーの操作の識別子。player.ts側の各icon-btn(btnMachineReset等)と1対1で対応する。
 * 言語切替だけは常時表示のテキストボタンで、この一覧の対象外。
 */
export type ToolbarActionId =
  | 'aspect'
  | 'pause'
  | 'machineReset'
  | 'saveState'
  | 'loadState'
  | 'screenshot'
  | 'fullscreen'
  | 'virtualKbd'
  | 'gamepad'
  | 'mouseCapture'
  | 'mouseResync'
  | 'resetOriginal'
  | 'pasteText'
  | 'romManager'
  | 'diskLibrary'
  | 'fileManager'
  | 'debuggerOpen'
  | 'help'
  | 'language'
  | 'mute'
  | 'fddSeekSound';

/** UIに存在する全操作の独立した基準。分類から項目が脱落していないかテストするために使う。 */
export const TOOLBAR_ACTIONS: readonly ToolbarActionId[] = [
  'aspect', 'pause', 'machineReset', 'saveState', 'loadState', 'screenshot', 'fullscreen', 'virtualKbd', 'gamepad',
  'mouseCapture', 'mouseResync', 'resetOriginal', 'pasteText', 'romManager', 'diskLibrary',
  'fileManager', 'debuggerOpen', 'help', 'language', 'mute', 'fddSeekSound',
];

/** 常時ツールバーに残す操作(使用頻度が高い/常に押せる必要があるもの)。 */
export const ALWAYS_VISIBLE_ACTIONS: readonly ToolbarActionId[] = [
  'pause',
  'fullscreen',
  'virtualKbd',
  'screenshot',
  'machineReset',
];

/**
 * 常時表示のうち、中央グループから切り離してツールバー右端へ寄せる操作。
 * リセットは誤爆すると起動中の状態(ゲストが積んだデータ等)が丸ごと吹き飛ぶため、
 * 頻繁に押す他の操作(ポーズ/全画面/仮想キーボード/スクリーンショット)と
 * 指が隣接しないよう、意図的に距離を置く配置にする。
 */
export const TOOLBAR_END_ACTIONS: readonly ToolbarActionId[] = ['machineReset'];

export type OverflowGroupId = 'display' | 'input' | 'sound' | 'disk' | 'state';

/**
 * オーバーフローメニュー第1階層(グループ一覧)に出す順序。
 * displayグループ(4:3表示切替)はWebX68k commit 694bd3f の移植。表示モードは他の設定より
 * 目に留まりやすい位置にしたいため先頭に置く。
 */
export const OVERFLOW_GROUP_ORDER: readonly OverflowGroupId[] = ['display', 'input', 'sound', 'disk', 'state'];

/** グループ→所属操作(第2階層に出す順序)。 */
export const OVERFLOW_GROUPS: Record<OverflowGroupId, readonly ToolbarActionId[]> = {
  display: ['aspect'],
  input: ['mouseCapture', 'mouseResync', 'gamepad', 'pasteText'],
  sound: ['mute', 'fddSeekSound'],
  disk: ['diskLibrary', 'fileManager'],
  state: ['saveState', 'loadState', 'resetOriginal'],
};

/** グループへ無理に押し込まず、第1階層へ直接並べる操作(WebX68kの設定・ヘルプ等と同じ扱い)。 */
export const OVERFLOW_DIRECT_ACTIONS: readonly ToolbarActionId[] = ['romManager', 'debuggerOpen', 'help', 'language'];

/** 常時表示+オーバーフロー全体の操作一覧。重複/抜け漏れが無いことをテストで検査する基準に使う。 */
export const ALL_TOOLBAR_ACTIONS: readonly ToolbarActionId[] = [
  ...ALWAYS_VISIBLE_ACTIONS,
  ...OVERFLOW_GROUP_ORDER.flatMap((groupId) => OVERFLOW_GROUPS[groupId]),
  ...OVERFLOW_DIRECT_ACTIONS,
];

/**
 * カスケード表示(親メニューを開いたまま右にサブメニューを重ねる)を使うか。
 * WebX68k実装と同じ640pxしきい値。横に余白が要るため、それ未満の狭い画面
 * (スマホ縦持ち等)では従来の差し替え式(← 戻る)にフォールバックする。
 */
export function isWideOverflowMenu(viewportWidth: number): boolean {
  return viewportWidth >= 640;
}

/** オーバーフローメニュー全体の開閉状態。 */
export type OverflowMenuState =
  | { level: 'closed' }
  | { level: 'root' }
  | { level: 'group'; group: OverflowGroupId }
  | { level: 'cascade'; group: OverflowGroupId };

export const CLOSED_OVERFLOW_MENU_STATE: OverflowMenuState = { level: 'closed' };
export const ROOT_OVERFLOW_MENU_STATE: OverflowMenuState = { level: 'root' };

/**
 * 第1階層は「…」から開いたことが自明なので見出しを出さない。
 * 狭い画面の第2階層は親メニューが消えて現在位置が分からなくなるため見出しを残す。
 */
export function overflowMenuHasHeading(level: 'root' | 'group'): boolean {
  return level === 'group';
}

/** 「…」ボタン押下時の次状態。既に何か開いていれば閉じる(トグル)。 */
export function toggleOverflowMenu(state: OverflowMenuState): OverflowMenuState {
  return state.level === 'closed' ? ROOT_OVERFLOW_MENU_STATE : CLOSED_OVERFLOW_MENU_STATE;
}

/** 第1階層のグループ行を押したときの次状態。wideならカスケード、狭ければ差し替え式。 */
export function selectOverflowGroup(group: OverflowGroupId, wide: boolean): OverflowMenuState {
  return wide ? { level: 'cascade', group } : { level: 'group', group };
}

/** 差し替え式(狭い画面)の「← 戻る」行の次状態。カスケードには戻る行が無い(親行を押し直せる)。 */
export function backToOverflowRoot(): OverflowMenuState {
  return ROOT_OVERFLOW_MENU_STATE;
}
