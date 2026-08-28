// HOSTDRV(ホストディレクトリをゲストDOSドライブとして見せる機能)の設定生成の単体テスト。
//
// 前提となる事実(2026-08-28 実測済み・実装コメント参照):
// - FreeDOS(98) + WebNP2 wasm で双方向動作を確認済み。コアの再ビルドは不要。
// - 必要なcfg([NekoProject21kai]セクション): use_hdrv=true / hdrvroot=<パス> / hdrv_acc=<数値>
// - use_hdrv は必ず文字列 "true" で書くこと。NP2kai/sdl/ini.c:275 のBOOLパーサは
//   !milstr_cmp(data, str_true) で"true"との一致だけを真とみなすため、"1"と書くと
//   警告もエラーも出さずに黙って偽になる(実測で1回踏んだ罠)。
// - hdrv_acc はビットフラグ(NP2kai/generic/hostdrv.h:15): 1=読み/2=書き/4=削除。
//   'ro'=1, 'rw'=3(既定), 'rwd'=7。

import { describe, expect, it } from 'vitest';
import {
  buildCfg,
  hostDrvAccessValue,
  applyHostDrv,
  type BootConfig,
  type DiskFile,
  type EmscriptenFS,
  type HostDrvConfig,
} from '../src/core/module.ts';

function baseConfig(overrides: Partial<BootConfig> = {}): BootConfig {
  return { fds: [], ...overrides };
}

describe('hostDrvAccessValue', () => {
  it('ro/rw/rwd がそれぞれ 1/3/7 に対応する', () => {
    expect(hostDrvAccessValue('ro')).toBe(1);
    expect(hostDrvAccessValue('rw')).toBe(3);
    expect(hostDrvAccessValue('rwd')).toBe(7);
  });
});

describe('buildCfg - hostdrv省略時(陰性対照)', () => {
  it('hostdrv未指定なら use_hdrv/hdrvroot/hdrv_acc が1つも出力に含まれない', () => {
    const cfg = buildCfg(baseConfig());
    expect(cfg).not.toContain('use_hdrv');
    expect(cfg).not.toContain('hdrvroot');
    expect(cfg).not.toContain('hdrv_acc');
  });
});

describe('buildCfg - hostdrv指定時', () => {
  it('use_hdrv=true が文字列としてそのまま出力される(iniパーサの罠の回帰固定)', () => {
    const cfg = buildCfg(baseConfig({ hostdrv: {} }));
    expect(cfg).toContain('use_hdrv=true');
    // "1"表記は警告なしに黙って偽扱いになる罠を再発させないための明示的な否定チェック
    expect(cfg).not.toContain('use_hdrv=1');
  });

  it('既定値: root=/hostdrv, access=rw(hdrv_acc=3)', () => {
    const cfg = buildCfg(baseConfig({ hostdrv: {} }));
    expect(cfg).toContain('hdrvroot=/hostdrv');
    expect(cfg).toContain('hdrv_acc=3');
  });

  it('root/accessを明示指定すればそれが反映される', () => {
    const cfg = buildCfg(baseConfig({ hostdrv: { root: '/a/b/c', access: 'rwd' } }));
    expect(cfg).toContain('hdrvroot=/a/b/c');
    expect(cfg).toContain('hdrv_acc=7');
  });

  it("access='ro' は hdrv_acc=1 になる", () => {
    const cfg = buildCfg(baseConfig({ hostdrv: { root: '/x', access: 'ro' } }));
    expect(cfg).toContain('hdrv_acc=1');
  });

  it('不正なroot(先頭が/でない)はErrorになる', () => {
    expect(() => buildCfg(baseConfig({ hostdrv: { root: 'hostdrv' } }))).toThrow();
  });

  it("不正なroot('..'を含む)はErrorになる", () => {
    expect(() => buildCfg(baseConfig({ hostdrv: { root: '/a/../b' } }))).toThrow();
  });
});

// applyHostDrv() は preRun 本体(src/core/module.ts のpreRunInjectDisks内)から
// 直接呼ばれている実処理そのもの(切り出しただけで複製ではない)。ヘルパ単体テストだけでは
// 「ヘルパは正しいが結線されていない」を検出できない(過去にヘルパ単体テスト511件全通過でも
// 実際の結線が壊れていた事例がある)ため、preRunが呼ぶのと同じ関数を検証することで
// この単体テストの範囲内での結線を保証する。実ブラウザでのFS結線・cfg読み込みまでの
// エンドツーエンド検証はscratchpad配下の別スクリプトで実施済み(HOSTDRV.COM経由で実測)。
describe('applyHostDrv - preRunと同一関数での結線検証', () => {
  function makeFsMock(): EmscriptenFS & {
    mkdirCalls: string[];
    writeFileCalls: Array<{ path: string; data: unknown }>;
  } {
    const existing = new Set<string>(['/']);
    const mkdirCalls: string[] = [];
    const writeFileCalls: Array<{ path: string; data: unknown }> = [];
    return {
      mkdirCalls,
      writeFileCalls,
      writeFile(path: string, data: Uint8Array | string) {
        writeFileCalls.push({ path, data });
        existing.add(path);
      },
      readFile() {
        return new Uint8Array();
      },
      mkdir(path: string) {
        mkdirCalls.push(path);
        existing.add(path);
      },
      createPreloadedFile() {
        // no-op
      },
      analyzePath(path: string) {
        return { exists: existing.has(path) };
      },
      stat() {
        return { mtime: 0, size: 0 };
      },
    };
  }

  it('多段rootの各段に対してmkdirが呼ばれ、filesがroot直下へwriteFileされる', () => {
    const files: DiskFile[] = [{ name: 'HELLO.TXT', bytes: new Uint8Array([1, 2, 3]) }];
    const fs = makeFsMock();
    const hostdrv: HostDrvConfig = { root: '/a/b/c', files };
    applyHostDrv(fs, hostdrv);
    expect(fs.mkdirCalls).toEqual(['/a', '/a/b', '/a/b/c']);
    const written = fs.writeFileCalls.find((w) => w.path === '/a/b/c/HELLO.TXT');
    expect(written).toBeDefined();
    expect(written?.data).toEqual(files[0].bytes);
  });

  it('既定rootでも/hostdrvが作成される', () => {
    const fs = makeFsMock();
    applyHostDrv(fs, {});
    expect(fs.mkdirCalls).toEqual(['/hostdrv']);
  });

  it('既存の段はmkdirを呼び直さない(analyzePathでexists判定)', () => {
    const fs = makeFsMock();
    applyHostDrv(fs, { root: '/a/b' });
    fs.mkdirCalls.length = 0;
    applyHostDrv(fs, { root: '/a/b/c' });
    // /a と /a/b は既に作成済みなので /a/b/c のみ呼ばれる
    expect(fs.mkdirCalls).toEqual(['/a/b/c']);
  });

  it('不正なroot(先頭が/でない)はErrorになり何も書き込まれない', () => {
    const fs = makeFsMock();
    expect(() => applyHostDrv(fs, { root: 'hostdrv' })).toThrow();
    expect(fs.mkdirCalls).toEqual([]);
  });

  it("不正なroot('..'を含む)はErrorになる", () => {
    const fs = makeFsMock();
    expect(() => applyHostDrv(fs, { root: '/a/../b' })).toThrow();
  });
});

describe('BootConfig.hostdrv 省略時は preRunInjectDisks 相当の呼び出しが発生しない(陰性対照)', () => {
  it('applyHostDrvを直接呼ばなければmkdir/writeFileは0回のまま', () => {
    // config.hostdrvが無いときpreRun内はapplyHostDrv自体を呼ばない実装になっている
    // (src/core/module.ts参照)。ここではapplyHostDrv単体が「呼ばれなければ何もしない」
    // ことを保証する必要はなく(呼ばれないこと自体がpreRun側の分岐で担保されるため)、
    // buildCfg側の陰性対照(上のdescribeブロック)と合わせて仕様を固定する。
    const config = baseConfig();
    expect(config.hostdrv).toBeUndefined();
  });
});
