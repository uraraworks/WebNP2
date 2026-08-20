import { describe, expect, it } from 'vitest';
import { layoutVpadSides, resolveLandscapeInsets, vpadSideBoxesFor, NO_SAFE_AREA, type SafeAreaInsets } from '../src/ui/virtual-pad.ts';

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

/**
 * iOS は横向きで左右対称にインセットを返すが、実際に塞がっているのはノッチ側だけ。
 * 実機実測: iPhone / inner 852x393 / dpr 3 / angle 90 / inset 59,59,0,20。
 * セーフエリアを塗って確認したところ、隠れていたのは左端の縦中央(ノッチ)のみで、
 * 右端の帯は完全に見えていた。
 */
describe('resolveLandscapeInsets', () => {
  const symmetric: SafeAreaInsets = { left: 59, right: 59, top: 0, bottom: 20 };

  it('angle 90 ではノッチのない右側を解放する', () => {
    expect(resolveLandscapeInsets(symmetric, 90)).toEqual({ left: 59, right: 0, top: 0, bottom: 20 });
  });

  it('angle 270 では逆側を解放する', () => {
    expect(resolveLandscapeInsets(symmetric, 270)).toEqual({ left: 0, right: 59, top: 0, bottom: 20 });
  });

  it.each([[0], [180]])('縦向き(angle %i)では触らない', (angle) => {
    expect(resolveLandscapeInsets(symmetric, angle)).toEqual(symmetric);
  });

  it('角度が取れないときは両側を避ける従来動作へ倒す', () => {
    expect(resolveLandscapeInsets(symmetric, null)).toEqual(symmetric);
  });

  it('左右が同値でないなら値が正確なので触らない', () => {
    const asymmetric: SafeAreaInsets = { left: 59, right: 12, top: 0, bottom: 20 };
    expect(resolveLandscapeInsets(asymmetric, 90)).toEqual(asymmetric);
  });

  it('インセット0のとき(Chrome等)は何も起きない', () => {
    const none: SafeAreaInsets = { left: 0, right: 0, top: 0, bottom: 0 };
    expect(resolveLandscapeInsets(none, 90)).toEqual(none);
  });

  it('解放した側のボタンが実際に大きくなる', () => {
    // 実機相当。ステージは 852x393 のフルスクリーンで canvas が高さ律速のとき。
    const viewport = { width: 852, height: 393 };
    const stage = { x: 127.5, y: 0, w: 597, h: 373 };
    const bound = new Set(['btn-a', 'btn-b']);
    const sizeOf = (insets: SafeAreaInsets): number => {
      const boxes = vpadSideBoxesFor(stage, viewport, insets);
      return layoutVpadSides(boxes, bound).find((item) => item.widget.kind === 'button')!.rect.w;
    };
    const both = sizeOf(symmetric);
    const resolved = sizeOf(resolveLandscapeInsets(symmetric, 90));
    expect(resolved).toBeGreaterThan(both * 1.5);
  });
});
