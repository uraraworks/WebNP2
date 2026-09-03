// ポーズボタン/オーバーレイの再描画を「状態が実際に変わったときだけ」行うための小さなモジュール。
//
// 経緯: かつては呼び出し側(player.ts)の4Hzポーリング(setInterval)から毎回無条件に
// btnPause.replaceChildren(...) を呼んでいた。これがボタンの唯一の子要素(実際にクリック
// される<svg>)を250msごとに作り直してしまい、mousedownからmouseupまでの間にこの差し替えが
// 挟まると、押した要素がDOMツリーから外れてclickイベントが発火しなくなる不具合があった
// (「何度か続けて押さないとポーズしない」という報告と一致する)。
// この不具合を再発させないため、直前に描画した状態を覚えておき、同じ状態なら
// classList.toggle / replaceChildren / title / setAttribute のいずれにも触らないようにする。

export interface PauseUiState {
  readonly corePaused: boolean;
  readonly pausedByUser: boolean;
}

export interface PauseUiClassList {
  toggle(className: string, force: boolean): void;
}

export interface PauseUiButton {
  readonly classList: PauseUiClassList;
  replaceChildren(...nodes: unknown[]): void;
  title: string;
  setAttribute(name: string, value: string): void;
}

export interface PauseUiOverlay {
  readonly classList: PauseUiClassList;
}

export interface PauseUiElements {
  readonly button: PauseUiButton;
  readonly overlay: PauseUiOverlay;
}

export interface PauseUiDeps {
  /** ボタンの子要素(アイコン)を新規に作る。svgIcon(...) 相当。 */
  makeIcon(corePaused: boolean): unknown;
  /** ボタンのtitle/aria-labelに使う文言。t('toolbarResume'|'toolbarPause') 相当。 */
  label(corePaused: boolean): string;
}

export interface PauseUiUpdater {
  /** 状態が前回と同じなら何もしない。変わっていればDOMへ反映する。 */
  update(state: PauseUiState): void;
  /**
   * キャッシュを無効化し、次のupdate()を無条件に反映させる。
   * 言語切替など、状態(corePaused/pausedByUser)は変わらないのに表示(アイコンの文言等)
   * だけを作り直したい場合に使う。
   */
  invalidate(): void;
}

export function createPauseUiUpdater(elements: PauseUiElements, deps: PauseUiDeps): PauseUiUpdater {
  let lastState: PauseUiState | null = null;

  const apply = (state: PauseUiState): void => {
    elements.button.classList.toggle('active', state.corePaused);
    elements.button.replaceChildren(deps.makeIcon(state.corePaused));
    const label = deps.label(state.corePaused);
    elements.button.title = label;
    elements.button.setAttribute('aria-label', label);
    elements.overlay.classList.toggle('hidden', !state.pausedByUser);
    lastState = state;
  };

  return {
    update(state: PauseUiState): void {
      if (
        lastState !== null &&
        lastState.corePaused === state.corePaused &&
        lastState.pausedByUser === state.pausedByUser
      ) {
        return;
      }
      apply(state);
    },
    invalidate(): void {
      lastState = null;
    },
  };
}
