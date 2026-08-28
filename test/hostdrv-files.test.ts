// HOSTDRV経由でIDEがゲストとやり取りするファイル操作(write/read/list/delete)の単体テスト。
//
// 前提となる事実:
// - src/core/module.ts の writeHostFile/readHostFile/listHostFiles/deleteHostFile は
//   src/api/webnp2.ts の WebNP2 クラス(writeHostFile等)から直接呼ばれている実処理そのもの
//   (applyHostDrvと同じ理由で、ヘルパ単体テストだけでは結線漏れを検出できないため、
//   preRun/クラスメソッドとテストが同じ関数を呼ぶことで結線を保証する)。
// - MEMFS上のパスは常に hostdrv.root 直下のみを対象とする。'/'や'..'を含む名前は
//   ルート外へ逃げられるため拒否する(パストラバーサル防止)。
// - ブラウザ経由でのビルド済みバンドルを使った結線検証(実際にゲストのHOSTDRVから
//   見える/読めることの確認)は scratchpad 配下の別スクリプトで実施済み。

import { describe, expect, it } from 'vitest';
import {
  writeHostFile,
  readHostFile,
  listHostFiles,
  deleteHostFile,
  validateHostFileName,
  requireHostDrv,
  type EmscriptenFS,
} from '../src/core/module.ts';

/** MEMFSの最小限インメモリ実装。readdir/unlinkまで含めてEmscriptenFS互換にする。 */
function makeFsMock(): EmscriptenFS & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>(['/']);
  return {
    files,
    writeFile(path: string, data: Uint8Array | string) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      files.set(path, bytes);
    },
    readFile(path: string) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`ENOENT: ${path}`);
      return bytes;
    },
    mkdir(path: string) {
      dirs.add(path);
    },
    createPreloadedFile() {
      // no-op
    },
    analyzePath(path: string) {
      return { exists: files.has(path) || dirs.has(path) };
    },
    stat() {
      return { mtime: 0, size: 0 };
    },
    readdir(path: string) {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const names = ['.', '..'];
      for (const p of files.keys()) {
        if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) {
          names.push(p.slice(prefix.length));
        }
      }
      return names;
    },
    unlink(path: string) {
      if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
      files.delete(path);
    },
  };
}

describe('validateHostFileName - 不正nameの拒否', () => {
  it('通常のファイル名は通す', () => {
    expect(() => validateHostFileName('HELLO.TXT')).not.toThrow();
  });

  it("'/'を含む名前は拒否する", () => {
    expect(() => validateHostFileName('a/b.txt')).toThrow();
  });

  it("'\\\\'を含む名前は拒否する", () => {
    expect(() => validateHostFileName('a\\b.txt')).toThrow();
  });

  it("'..'そのものは拒否する", () => {
    expect(() => validateHostFileName('..')).toThrow();
  });

  it("'.'そのものは拒否する", () => {
    expect(() => validateHostFileName('.')).toThrow();
  });

  it('空文字は拒否する', () => {
    expect(() => validateHostFileName('')).toThrow();
  });
});

describe('writeHostFile / readHostFile', () => {
  it('書いたバイト列をそのまま読み戻せる', () => {
    const fs = makeFsMock();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    writeHostFile(fs, '/hostdrv', 'A.BIN', bytes);
    expect(fs.files.get('/hostdrv/A.BIN')).toEqual(bytes);
    expect(readHostFile(fs, '/hostdrv', 'A.BIN')).toEqual(bytes);
  });

  it('存在しないファイルを読むとErrorではなくnullを返す', () => {
    const fs = makeFsMock();
    expect(readHostFile(fs, '/hostdrv', 'NOPE.TXT')).toBeNull();
  });

  it('不正な名前(パス区切りを含む)ではwriteHostFile/readHostFileともにErrorになる', () => {
    const fs = makeFsMock();
    expect(() => writeHostFile(fs, '/hostdrv', '../ESCAPE.TXT', new Uint8Array())).toThrow();
    expect(() => readHostFile(fs, '/hostdrv', '../ESCAPE.TXT')).toThrow();
  });
});

describe('listHostFiles', () => {
  it('root直下に書いたファイル名だけを返す(サブディレクトリ相当や"."/".."は含まない)', () => {
    const fs = makeFsMock();
    writeHostFile(fs, '/hostdrv', 'ONE.TXT', new Uint8Array([1]));
    writeHostFile(fs, '/hostdrv', 'TWO.TXT', new Uint8Array([2]));
    const names = listHostFiles(fs, '/hostdrv').sort();
    expect(names).toEqual(['ONE.TXT', 'TWO.TXT']);
  });

  it('rootが空でも空配列を返す', () => {
    const fs = makeFsMock();
    fs.mkdir('/hostdrv');
    expect(listHostFiles(fs, '/hostdrv')).toEqual([]);
  });
});

describe('deleteHostFile', () => {
  it('存在するファイルを削除するとtrueを返し、以後読めなくなる', () => {
    const fs = makeFsMock();
    writeHostFile(fs, '/hostdrv', 'DEL.TXT', new Uint8Array([9]));
    expect(deleteHostFile(fs, '/hostdrv', 'DEL.TXT')).toBe(true);
    expect(readHostFile(fs, '/hostdrv', 'DEL.TXT')).toBeNull();
  });

  it('存在しないファイルを削除しようとするとfalseを返す(Errorにしない)', () => {
    const fs = makeFsMock();
    expect(deleteHostFile(fs, '/hostdrv', 'NOPE.TXT')).toBe(false);
  });

  it('不正な名前(パス区切りを含む)はErrorになる', () => {
    const fs = makeFsMock();
    expect(() => deleteHostFile(fs, '/hostdrv', '../ESCAPE.TXT')).toThrow();
  });
});

describe('requireHostDrv - hostdrv未設定時のError(陰性対照)', () => {
  it('fsがnullならError', () => {
    expect(() => requireHostDrv(null, '/hostdrv')).toThrow();
  });

  it('hostdrvRootがnullならError(boot()にhostdrvを渡していない状態)', () => {
    const fs = makeFsMock();
    expect(() => requireHostDrv(fs, null)).toThrow();
  });

  it('両方揃っていればfs/rootを返す', () => {
    const fs = makeFsMock();
    const result = requireHostDrv(fs, '/hostdrv');
    expect(result.fs).toBe(fs);
    expect(result.root).toBe('/hostdrv');
  });
});
