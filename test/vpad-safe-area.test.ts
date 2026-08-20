import { describe, expect, it } from 'vitest';
import { layoutVpadSides, vpadSideBoxesFor, NO_SAFE_AREA, type SafeAreaInsets } from '../src/ui/virtual-pad.ts';

// iPhone 横向きスタンドアロンの実測相当。ノッチ側 59px、ホームインジケータ側 21px。
const VIEWPORT = { width: 874, height: 402 };
// 再現状態(ホーム画面からのフルスクリーン + バーチャルジョイパッド表示)の
// ステージ実測値。874x402 のビューポートで計測した値をそのまま使う。
const STAGE = { x: 161, y: 0, w: 552, h: 345 };
const BOUND = new Set(['dpad-up', 'dpad-down', 'dpad-left', 'dpad-right', 'btn-a', 'btn-b']);

const notchLeft: SafeAreaInsets = { left: 59, right: 0, top: 0, bottom: 21 };
const notchRight: SafeAreaInsets = { left: 0, right: 59, top: 0, bottom: 21 };

describe('vpadSideBoxesFor', () => {
  it('インセット0なら従来式(x:0〜innerWidth)と一致する', () => {
    const boxes = vpadSideBoxesFor(STAGE, VIEWPORT, NO_SAFE_AREA);
    expect(boxes.left).toEqual({ x: 0, y: STAGE.y, w: STAGE.x, h: STAGE.h });
    expect(boxes.right).toEqual({
      x: STAGE.x + STAGE.w, y: STAGE.y, w: VIEWPORT.width - (STAGE.x + STAGE.w), h: STAGE.h,
    });
  });

  it('左ノッチぶんだけ左ボックスを内側へ寄せる', () => {
    const boxes = vpadSideBoxesFor(STAGE, VIEWPORT, notchLeft);
    expect(boxes.left.x).toBe(59);
    expect(boxes.left.w).toBe(STAGE.x - 59);
  });

  it('右ノッチぶんだけ右ボックスの右端を手前で止める', () => {
    const boxes = vpadSideBoxesFor(STAGE, VIEWPORT, notchRight);
    expect(boxes.right.x + boxes.right.w).toBe(VIEWPORT.width - 59);
  });

  it('ステージがビューポートを覆っても負の幅を作らない', () => {
    const boxes = vpadSideBoxesFor({ x: 0, y: 0, w: VIEWPORT.width, h: VIEWPORT.height }, VIEWPORT, notchLeft);
    expect(boxes.left.w).toBe(0);
    expect(boxes.right.w).toBe(0);
  });

  it('下端インセットぶんボックスの高さを詰める', () => {
    const tall = { x: 161, y: 0, w: 552, h: VIEWPORT.height };
    const boxes = vpadSideBoxesFor(tall, VIEWPORT, notchLeft);
    expect(boxes.left.h).toBe(VIEWPORT.height - 21);
    expect(boxes.right.h).toBe(VIEWPORT.height - 21);
  });
});

/**
 * 本来の受け入れ条件。ボックスではなく「実際に配置された部品」がセーフエリア内に
 * 収まることを見る。ノッチは持ち方で左右どちらにも来るので両向きを回す。
 */
describe('配置された部品がセーフエリアに収まる', () => {
  for (const [label, insets] of [['左ノッチ', notchLeft], ['右ノッチ', notchRight]] as const) {
    it(`${label}: すべての部品がセーフエリアの内側にある`, () => {
      const boxes = vpadSideBoxesFor(STAGE, VIEWPORT, insets);
      const laidOut = layoutVpadSides(boxes, BOUND);
      expect(laidOut.length).toBeGreaterThan(0);
      for (const { widget, rect } of laidOut) {
        const name = widget.kind === 'dpad' ? 'stick' : widget.id;
        expect(rect.x, `${name} の左端`).toBeGreaterThanOrEqual(insets.left - 1e-6);
        expect(rect.x + rect.w, `${name} の右端`).toBeLessThanOrEqual(VIEWPORT.width - insets.right + 1e-6);
        expect(rect.y + rect.h, `${name} の下端`).toBeLessThanOrEqual(VIEWPORT.height - insets.bottom + 1e-6);
      }
    });
  }

  it('陰性対照: 従来式(セーフエリア無視)だとこの条件は満たされない', () => {
    const legacy = vpadSideBoxesFor(STAGE, VIEWPORT, NO_SAFE_AREA);
    const laidOut = layoutVpadSides(legacy, BOUND);
    const stick = laidOut.find((item) => item.widget.kind === 'dpad')!;
    expect(stick.rect.x).toBeLessThan(notchLeft.left);
    const a = laidOut.find((item) => item.widget.kind === 'button' && item.widget.id === 'btn-a')!;
    expect(a.rect.x + a.rect.w).toBeGreaterThan(VIEWPORT.width - notchRight.right);
  });
});
