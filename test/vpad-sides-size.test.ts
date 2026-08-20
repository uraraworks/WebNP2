import { describe, expect, it } from 'vitest';
import { layoutVpadSides, vpadSideBoxesFor, type SafeAreaInsets } from '../src/ui/virtual-pad.ts';

// 実機(iPhone横向きスタンドアロン)の再現状態。ステージは実測値。
const VIEWPORT = { width: 874, height: 402 };
const STAGE = { x: 161, y: 0, w: 552, h: 345 };
const NOTCH: SafeAreaInsets = { left: 59, right: 59, top: 0, bottom: 21 };
const NO_NOTCH: SafeAreaInsets = { left: 0, right: 0, top: 0, bottom: 0 };
// PC-98 の常用構成: 左にオプション1/2とスティック、右にA/B。
const BOUND = new Set(['dpad-up', 'dpad-down', 'dpad-left', 'dpad-right', 'btn-a', 'btn-b', 'btn-opt1', 'btn-opt2']);

const layout = (insets: SafeAreaInsets) => {
  const boxes = vpadSideBoxesFor(STAGE, VIEWPORT, insets);
  return { boxes, items: layoutVpadSides(boxes, BOUND) };
};
const sizeOf = (insets: SafeAreaInsets, id: string): number => {
  const { items } = layout(insets);
  const hit = items.find((item) => (item.widget.kind === 'dpad' ? 'stick' : item.widget.id) === id);
  if (!hit) throw new Error(`${id} が配置されていない`);
  return hit.rect.w;
};

describe('sides配置の部品サイズ', () => {
  // 横向き(sides)は縦向き(panel)より部品が小さくなる。箱に入る範囲まで詰める。
  // 下限は改善後の実測値。下回ったら詰めが緩んだということ。
  it.each([
    ['stick', 90],
    ['btn-opt1', 42],
    ['btn-a', 45],
  ])('ノッチありでも %s は %i px 以上ある', (id, floor) => {
    expect(sizeOf(NOTCH, id)).toBeGreaterThanOrEqual(floor);
  });

  it('2ボタン構成では横幅を3分割せず2分割する', () => {
    // 旧実装は常に right.w/3 で割り、使わない1列ぶんを捨てていた。
    const { boxes } = layout(NOTCH);
    const legacyDiameter = Math.min(boxes.right.w / 3, boxes.right.h / 2) * 0.8;
    expect(sizeOf(NOTCH, 'btn-a')).toBeGreaterThan(legacyDiameter * 1.5);
  });

  it('箱が横広でもオプションボタンが潰れない', () => {
    // 左ボックス 225x260(実DOM実測の形状)。スティックを先に最大化する実装では
    // 「余った隙間」からオプションを取るため 28.8px まで潰れていた。
    const boxes = { left: { x: 0, y: 0, w: 225, h: 260 }, right: { x: 649, y: 0, w: 225, h: 260 } };
    const items = layoutVpadSides(boxes, BOUND);
    const opt = items.find((item) => item.widget.kind === 'button' && item.widget.id === 'btn-opt1')!;
    expect(opt.rect.w).toBeGreaterThan(50);
    // 帯を先取りしてもスティックは旧係数(0.7掛け)より大きいままであること。
    const stick = items.find((item) => item.widget.kind === 'dpad')!;
    expect(stick.rect.w).toBeGreaterThan(Math.min(225, 260) * 0.7);
    // 帯とスティックが重なっていないこと。
    expect(stick.rect.y).toBeGreaterThanOrEqual(opt.rect.y + opt.rect.h - 1e-6);
  });

  it('陰性対照: 旧係数のままなら上の下限を満たさない', () => {
    const { boxes } = layout(NOTCH);
    expect(Math.min(boxes.left.w, boxes.left.h) * 0.7).toBeLessThan(90);
    expect(Math.min(boxes.left.w * 0.36, boxes.left.h) * 0.85).toBeLessThan(42);
    expect(Math.min(boxes.right.w / 3, boxes.right.h / 2) * 0.8).toBeLessThan(45);
  });
});

describe('大きくしても崩れない', () => {
  for (const [label, insets] of [['ノッチ無し', NO_NOTCH], ['ノッチあり', NOTCH]] as const) {
    it(`${label}: 部品どうしが重ならない`, () => {
      const { items } = layout(insets);
      expect(items.length).toBe(5);
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i].rect;
          const b = items[j].rect;
          const dx = (a.x + a.w / 2) - (b.x + b.w / 2);
          const dy = (a.y + a.h / 2) - (b.y + b.h / 2);
          const need = (a.w + b.w) / 2;
          expect(Math.hypot(dx, dy), `${i}と${j}の中心間距離`).toBeGreaterThanOrEqual(need - 1e-6);
        }
      }
    });

    it(`${label}: 部品がセーフエリアからはみ出さない`, () => {
      const { items } = layout(insets);
      for (const { rect } of items) {
        expect(rect.x).toBeGreaterThanOrEqual(insets.left - 1e-6);
        expect(rect.x + rect.w).toBeLessThanOrEqual(VIEWPORT.width - insets.right + 1e-6);
        expect(rect.y).toBeGreaterThanOrEqual(insets.top - 1e-6);
        expect(rect.y + rect.h).toBeLessThanOrEqual(VIEWPORT.height - insets.bottom + 1e-6);
      }
    });
  }
});
