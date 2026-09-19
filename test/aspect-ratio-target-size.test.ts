import { describe, expect, it } from 'vitest';
import { getTargetSize, parseAspectModeParam, resolveAspectMode } from '../src/ui/aspect.ts';

// getTargetSize() は src/ui/aspect.ts に切り出した DOM 非依存の純関数(player.ts の rescale()
// から呼ばれる、WebX68k src/aspect.ts からの移植)。ここで直接importして製品コードそのものを
// 検証できる。
//
// 検証したい不変条件は「4:3化は常に拡大方向で行い、どちらの軸も縮小しない」こと。
// #canvas は styles.css で image-rendering: pixelated(最近傍補間)にしているため、
// 縮小方向で4:3化すると1ドット幅の縦線が間引かれて消え、テキスト画面の文字が潰れる
// 不具合をWebX68k側で実際に踏んだ(2026-08)。将来また縮小方向に戻されないよう、ここで固定する。

describe('4:3表示モードの目標サイズ(src/ui/aspect.ts の getTargetSize)', () => {
  it('640x400(アスペクト比 > 4/3、NP2kaiの通常モード)は横を保ち縦を伸ばす(640x480)', () => {
    const result = getTargetSize('4:3', 640, 400);
    expect(result.width).toBe(640);
    expect(result.height).toBeCloseTo(480, 6);
    expect(result.height).toBeGreaterThan(400); // 縮小になっていないこと
  });

  it('640x200(アスペクト比 > 4/3、PC-98の200ライングラフィック)は横を保ち縦を伸ばす(640x480)', () => {
    const result = getTargetSize('4:3', 640, 200);
    expect(result.width).toBe(640);
    expect(result.height).toBeCloseTo(480, 6);
    expect(result.height).toBeGreaterThan(200);
  });

  it('640x480(ちょうど4/3、31kHz/480ライン)は変化なし', () => {
    const result = getTargetSize('4:3', 640, 480);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it('アスペクト比 < 4/3(縦長)になるケースでは縦を保ち横を広げる', () => {
    const result = getTargetSize('4:3', 400, 400);
    expect(result.height).toBe(400);
    expect(result.width).toBeCloseTo((400 * 4) / 3, 6);
    expect(result.width).toBeGreaterThan(400);
  });

  it('どのケースでも元の実解像度を下回らない(縮小しない)', () => {
    const cases: Array<[number, number]> = [
      [640, 400],
      [640, 200],
      [640, 480],
      [400, 400],
    ];
    for (const [w, h] of cases) {
      const result = getTargetSize('4:3', w, h);
      expect(result.width).toBeGreaterThanOrEqual(w);
      expect(result.height).toBeGreaterThanOrEqual(h);
    }
  });

  it("'native' モードでは補正せずそのまま返す", () => {
    const cases: Array<[number, number]> = [
      [640, 400],
      [640, 200],
      [640, 480],
    ];
    for (const [w, h] of cases) {
      const result = getTargetSize('native', w, h);
      expect(result).toEqual({ width: w, height: h });
    }
  });
});

// 表示モードの既定値判定(src/ui/aspect.ts の resolveAspectMode)。
// localStorage 未設定(初回起動)時の既定は '4:3'(実機モニタ相当)。
// native は明示的に選ぶオプション。既に明示的に選んで保存済みの値がある場合は
// それを尊重し、上書きしないこと。
describe('表示モードの既定値判定(src/ui/aspect.ts の resolveAspectMode)', () => {
  it('localStorage 未設定(null)のときは既定の 4:3 になる', () => {
    expect(resolveAspectMode(null)).toBe('4:3');
  });

  it('不正な値が保存されていた場合も既定の 4:3 にフォールバックする', () => {
    expect(resolveAspectMode('bogus')).toBe('4:3');
    expect(resolveAspectMode('')).toBe('4:3');
  });

  it("保存済みの 'native' は尊重され、既定値で上書きされない", () => {
    expect(resolveAspectMode('native')).toBe('native');
  });

  it("保存済みの '4:3' はそのまま尊重される", () => {
    expect(resolveAspectMode('4:3')).toBe('4:3');
  });
});

// URLパラメータ ?aspect= のパース(main.ts から呼ばれる)。
describe('?aspect= のパース(src/ui/aspect.ts の parseAspectModeParam)', () => {
  it("'4:3'/'native' はそのまま通す", () => {
    expect(parseAspectModeParam('4:3')).toBe('4:3');
    expect(parseAspectModeParam('native')).toBe('native');
  });

  it('未指定(null)・不正値はnullを返す(main.ts側で警告を出し既定値へフォールバックする)', () => {
    expect(parseAspectModeParam(null)).toBeNull();
    expect(parseAspectModeParam('bogus')).toBeNull();
    expect(parseAspectModeParam('')).toBeNull();
  });
});
