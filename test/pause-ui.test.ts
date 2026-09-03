import { describe, expect, it, vi } from 'vitest';
import { createPauseUiUpdater, type PauseUiButton, type PauseUiOverlay } from '../src/ui/pause-ui.ts';

// player.ts の実バグ再現用の最小フェイク要素。
// 実DOM要素と同じ形(classList.toggle / replaceChildren / title / setAttribute)を持つ。
function makeButton(): PauseUiButton & { replaceChildrenCalls: number; firstChild: unknown } {
  const state = {
    replaceChildrenCalls: 0,
    firstChild: null as unknown,
    title: '',
    classList: {
      toggle: vi.fn((_className: string, _force: boolean) => {}),
    },
    setAttribute: vi.fn((_name: string, _value: string) => {}),
    replaceChildren(...nodes: unknown[]) {
      state.replaceChildrenCalls += 1;
      // 実DOMのreplaceChildrenと同様、子要素の参照(=クリック対象)がここで作り直される。
      state.firstChild = nodes[0];
    },
  };
  return state;
}

function makeOverlay(): PauseUiOverlay & { toggleCalls: Array<[string, boolean]> } {
  const toggleCalls: Array<[string, boolean]> = [];
  return {
    toggleCalls,
    classList: {
      toggle: (className: string, force: boolean) => {
        toggleCalls.push([className, force]);
      },
    },
  };
}

describe('createPauseUiUpdater', () => {
  it('状態が変わらない限りDOM更新関数(replaceChildren等)を呼ばない', () => {
    const button = makeButton();
    const overlay = makeOverlay();
    const makeIcon = vi.fn((corePaused: boolean) => ({ icon: corePaused }));
    const label = vi.fn((corePaused: boolean) => (corePaused ? 'resume' : 'pause'));
    const updater = createPauseUiUpdater({ button, overlay }, { makeIcon, label });

    updater.update({ corePaused: false, pausedByUser: false });
    expect(button.replaceChildrenCalls).toBe(1);
    expect(makeIcon).toHaveBeenCalledTimes(1);

    // player.tsの4Hzポーリング相当: 同じ状態でupdate()を何度も呼んでも
    // 2回目以降はDOMへ一切触らない(=replaceChildrenが増えない)ことを検査する。
    // これが崩れると、ボタンの子要素(クリック対象のsvg)がポーリングのたびに
    // 作り直され、mousedown〜mouseup間に挟まった場合clickイベントが発火しなくなる。
    for (let i = 0; i < 10; i += 1) {
      updater.update({ corePaused: false, pausedByUser: false });
    }
    expect(button.replaceChildrenCalls).toBe(1);
    expect(makeIcon).toHaveBeenCalledTimes(1);
    expect(button.classList.toggle).toHaveBeenCalledTimes(1);
    expect(button.setAttribute).toHaveBeenCalledTimes(1);
  });

  it('firstChild(クリック対象の参照)は状態不変のポーリングを挟んでも同一のまま', () => {
    const button = makeButton();
    const overlay = makeOverlay();
    const updater = createPauseUiUpdater(
      { button, overlay },
      { makeIcon: (corePaused) => ({ icon: corePaused }), label: () => 'label' },
    );

    updater.update({ corePaused: false, pausedByUser: false });
    const firstRef = button.firstChild;
    expect(firstRef).not.toBeNull();

    for (let i = 0; i < 5; i += 1) {
      updater.update({ corePaused: false, pausedByUser: false });
    }
    expect(button.firstChild).toBe(firstRef);
  });

  it('状態が実際に変わったときはDOMへ反映する', () => {
    const button = makeButton();
    const overlay = makeOverlay();
    const updater = createPauseUiUpdater(
      { button, overlay },
      { makeIcon: (corePaused) => ({ icon: corePaused }), label: (corePaused) => (corePaused ? 'resume' : 'pause') },
    );

    updater.update({ corePaused: false, pausedByUser: false });
    expect(button.replaceChildrenCalls).toBe(1);

    updater.update({ corePaused: true, pausedByUser: false });
    expect(button.replaceChildrenCalls).toBe(2);
    expect(button.firstChild).toEqual({ icon: true });
    expect(button.title).toBe('resume');

    updater.update({ corePaused: true, pausedByUser: true });
    expect(overlay.toggleCalls.at(-1)).toEqual(['hidden', false]);
  });

  it('invalidate()の後は状態が同じでも強制的に再描画する(言語切替相当)', () => {
    const button = makeButton();
    const overlay = makeOverlay();
    let currentLabel = 'pause';
    const updater = createPauseUiUpdater(
      { button, overlay },
      { makeIcon: (corePaused) => ({ icon: corePaused }), label: () => currentLabel },
    );

    updater.update({ corePaused: false, pausedByUser: false });
    expect(button.title).toBe('pause');

    // 言語が切り替わってlabel()の返す文言が変わった場合、状態(corePaused/pausedByUser)
    // 自体は不変なのでinvalidate()せずにupdate()しても古い文言のまま止まってしまう。
    currentLabel = 'ぽーず';
    updater.update({ corePaused: false, pausedByUser: false });
    expect(button.title).toBe('pause');

    updater.invalidate();
    updater.update({ corePaused: false, pausedByUser: false });
    expect(button.title).toBe('ぽーず');
    expect(button.replaceChildrenCalls).toBe(2);
  });
});
