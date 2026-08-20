import { describe, expect, it } from 'vitest';
import { fitSubScale } from '../src/ui/player.ts';

/**
 * 1倍未満スケールの決め方。
 * 狙いは「物理ピクセルで整数倍に乗るならスナップして pixelated を保つ。
 * 乗せると画面を大きく捨てるなら端数のまま補間へ落とす」。
 */
describe('fitSubScale', () => {
  it('物理ちょうど整数倍ならそのまま、補間しない (DPR3 の 2/3)', () => {
    const r = fitSubScale(2 / 3, 3);
    expect(r.smooth).toBe(false);
    expect(r.scale * 3).toBeCloseTo(2, 6);
  });

  it('物理整数倍をわずかに超えるだけなら切り下げてスナップする', () => {
    // deviceScale = 2.04 → ロス約2%。切り下げても画面はほぼ減らない。
    const r = fitSubScale(0.68, 3);
    expect(r.smooth).toBe(false);
    expect(r.scale).toBeCloseTo(2 / 3, 6);
  });

  it('切り下げると画面を大きく捨てる場合は端数を保ち補間へ落とす', () => {
    // deviceScale = 1.98 → 1倍まで落とすと面積が半分になる。捨てない。
    const r = fitSubScale(0.66, 3);
    expect(r.smooth).toBe(true);
    expect(r.scale).toBe(0.66);
  });

  it('DPR1 で1倍未満なら物理整数倍に乗せる余地が無く補間になる', () => {
    const r = fitSubScale(0.66, 1);
    expect(r.smooth).toBe(true);
    expect(r.scale).toBe(0.66);
  });

  it('DPR2 でも同じ規則が効く', () => {
    expect(fitSubScale(0.52, 2)).toEqual({ scale: 0.5, smooth: false });
    expect(fitSubScale(0.9, 2).smooth).toBe(true);
  });

  it('DPR が 0/未定義でも 1 とみなして落ちない', () => {
    expect(fitSubScale(0.5, 0).scale).toBe(0.5);
    expect(fitSubScale(1, 0)).toEqual({ scale: 1, smooth: false });
  });

  it('スナップ結果は元のスケールを超えない (はみ出させない)', () => {
    for (const dpr of [1, 2, 2.625, 3]) {
      for (let raw = 0.3; raw < 1; raw += 0.01) {
        expect(fitSubScale(raw, dpr).scale).toBeLessThanOrEqual(raw + 1e-9);
      }
    }
  });
});
