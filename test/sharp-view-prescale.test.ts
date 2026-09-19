import { describe, expect, it } from 'vitest';
import { computePrescale } from '../src/ui/sharp-view.ts';

/*
 * computePrescale(): 実解像度→CSS表示サイズへの拡大のうち、最近傍で行うべき
 * 整数倍率(kx, ky)を求める。残りの端数倍だけがCSS側の補間(auto)に任される。
 * (WebX68k src/sharp-view.ts からの移植。ケースはWebNP2の実解像度640x400/640x480に合わせる。)
 */
describe('computePrescale', () => {
  it('640x400 を 4:3(640x480相当) で css 1280x960, dpr 2 → 4倍', () => {
    expect(computePrescale(640, 400, 1280, 960, 2)).toEqual({ kx: 4, ky: 4 });
  });

  it('640x400 を css 640x480, dpr 1 → 1倍', () => {
    expect(computePrescale(640, 400, 640, 480, 1)).toEqual({ kx: 1, ky: 1 });
  });

  it('640x400 を css 640x480, dpr 2 → 2倍', () => {
    expect(computePrescale(640, 400, 640, 480, 2)).toEqual({ kx: 2, ky: 2 });
  });

  it('640x480(ちょうど4:3) を css 1280x960(2倍), dpr 1 → 2倍', () => {
    expect(computePrescale(640, 480, 1280, 960, 1)).toEqual({ kx: 2, ky: 2 });
  });

  it('dpr が 0/NaN のときは1として扱う', () => {
    expect(computePrescale(640, 400, 640, 400, 0)).toEqual({ kx: 1, ky: 1 });
    expect(computePrescale(640, 400, 640, 400, Number.NaN)).toEqual({ kx: 1, ky: 1 });
  });

  it('中間バッファが上限(1辺8192 / 総画素16,777,216)を超えないよう倍率を落とす', () => {
    const { kx, ky } = computePrescale(640, 640, 8000, 8000, 2);
    expect(640 * kx).toBeLessThanOrEqual(8192);
    expect(640 * ky).toBeLessThanOrEqual(8192);
    expect(640 * kx * 640 * ky).toBeLessThanOrEqual(16_777_216);
  });

  it('css が native より小さい(縮小)ときは1倍のまま', () => {
    expect(computePrescale(640, 400, 320, 200, 1)).toEqual({ kx: 1, ky: 1 });
  });
});
