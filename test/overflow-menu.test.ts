import { describe, expect, it } from 'vitest';
import {
  ALL_TOOLBAR_ACTIONS,
  ALWAYS_VISIBLE_ACTIONS,
  backToOverflowRoot,
  CLOSED_OVERFLOW_MENU_STATE,
  isWideOverflowMenu,
  OVERFLOW_GROUP_ORDER,
  OVERFLOW_GROUPS,
  OVERFLOW_DIRECT_ACTIONS,
  overflowMenuHasHeading,
  ROOT_OVERFLOW_MENU_STATE,
  selectOverflowGroup,
  toggleOverflowMenu,
  TOOLBAR_ACTIONS,
  type ToolbarActionId,
} from '../src/ui/overflow-menu.ts';

describe('グループ定義', () => {
  it('常時表示はWebX68kと同じ考え方の4項目に絞る', () => {
    expect(ALWAYS_VISIBLE_ACTIONS).toEqual([
      'machineReset',
      'fullscreen',
      'virtualKbd',
      'screenshot',
    ]);
  });

  it('オーバーフローはinput/sound/disk/stateの4グループ', () => {
    expect(OVERFLOW_GROUP_ORDER).toEqual(['input', 'sound', 'disk', 'state']);
    expect(OVERFLOW_GROUPS.input).toEqual(['mouseCapture', 'mouseResync', 'gamepad', 'pasteText']);
    expect(OVERFLOW_GROUPS.sound).toEqual(['mute', 'fddSeekSound']);
    expect(OVERFLOW_GROUPS.disk).toEqual(['diskLibrary', 'fileManager']);
    expect(OVERFLOW_GROUPS.state).toEqual(['saveState', 'loadState', 'resetOriginal']);
    expect(OVERFLOW_DIRECT_ACTIONS).toEqual(['romManager', 'debuggerOpen', 'help', 'language']);
  });

  it('常時表示・3グループ・直結行の間で重複が無い', () => {
    const overflowIds = [...OVERFLOW_GROUP_ORDER.flatMap((g) => OVERFLOW_GROUPS[g]), ...OVERFLOW_DIRECT_ACTIONS];
    const seen = new Set<ToolbarActionId>();
    for (const id of [...ALWAYS_VISIBLE_ACTIONS, ...overflowIds]) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('常時表示とオーバーフローの和がUIの全アクションと一致し、取りこぼしが無い', () => {
    expect(ALL_TOOLBAR_ACTIONS).toHaveLength(TOOLBAR_ACTIONS.length);
    expect(new Set(ALL_TOOLBAR_ACTIONS)).toEqual(new Set(TOOLBAR_ACTIONS));
  });
});

describe('isWideOverflowMenu', () => {
  it('640px以上はカスケード(wide)', () => {
    expect(isWideOverflowMenu(640)).toBe(true);
    expect(isWideOverflowMenu(1280)).toBe(true);
  });

  it('640px未満は差し替え式(narrow)', () => {
    expect(isWideOverflowMenu(639)).toBe(false);
    expect(isWideOverflowMenu(375)).toBe(false);
  });
});

describe('オーバーフローメニューの開閉状態遷移', () => {
  it('閉状態から「…」を押すとrootが開く', () => {
    expect(toggleOverflowMenu(CLOSED_OVERFLOW_MENU_STATE)).toEqual(ROOT_OVERFLOW_MENU_STATE);
  });

  it('root/group/cascadeいずれから「…」を押しても閉じる(トグル)', () => {
    expect(toggleOverflowMenu(ROOT_OVERFLOW_MENU_STATE)).toEqual(CLOSED_OVERFLOW_MENU_STATE);
    expect(toggleOverflowMenu({ level: 'group', group: 'input' })).toEqual(CLOSED_OVERFLOW_MENU_STATE);
    expect(toggleOverflowMenu({ level: 'cascade', group: 'state' })).toEqual(CLOSED_OVERFLOW_MENU_STATE);
  });

  it('広い画面でグループ行を選ぶとcascadeへ遷移し、親は閉じない想定の状態になる', () => {
    expect(selectOverflowGroup('input', true)).toEqual({ level: 'cascade', group: 'input' });
  });

  it('狭い画面でグループ行を選ぶとgroup(差し替え)へ遷移する', () => {
    expect(selectOverflowGroup('disk', false)).toEqual({ level: 'group', group: 'disk' });
  });

  it('差し替え式の「← 戻る」はrootへ戻る', () => {
    expect(backToOverflowRoot()).toEqual(ROOT_OVERFLOW_MENU_STATE);
  });
});

describe('オーバーフローメニューの見出し', () => {
  it('第1階層には冗長な「その他」見出しを出さない', () => {
    expect(overflowMenuHasHeading('root')).toBe(false);
  });

  it('狭い画面で親が消える第2階層にはグループ見出しを残す', () => {
    expect(overflowMenuHasHeading('group')).toBe(true);
  });
});
