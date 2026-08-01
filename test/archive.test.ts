// LZH/ZIP展開モジュール(src/api/archive.ts 他)の単体テスト。
// LZHはテスト内で自前でバイナリを組み立てて検証する(lh5等の実データ検証は末尾の説明を参照)。
// ZIPはNodeのzlib.deflateRawSyncで圧縮データを作り、ZIP構造(ローカルヘッダ+セントラルディレクトリ+EOCD)を
// 自前で組み立てて検証する。

import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extractArchive, isArchive } from '../src/api/archive.ts';
import { extractLzh } from '../src/api/lzh.ts';
import { crc16, crc32 } from '../src/api/archive-util.ts';

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function fixturePath(relPath: string): string {
  return fileURLToPath(new URL(`./fixtures/lzh/${relPath}`, import.meta.url));
}

function readFixture(relPath: string): Uint8Array {
  return new Uint8Array(readFileSync(fixturePath(relPath)));
}

function hasFixture(relPath: string): boolean {
  return existsSync(fixturePath(relPath));
}

// --- LZHバイナリ組み立てヘルパー ------------------------------------------------------

function sjisBytes(name: string): Uint8Array {
  // テストで使う範囲(ASCII + 一部の日本語)は Buffer の 'latin1' ではデコードできないため、
  // Node標準機能で用意されている変換手段がない代わりに、TextEncoderでUTF-8化してから
  // Shift_JISとして解釈させず、ASCII文字のみのケースはそのままエンコードし、
  // 日本語を含むケースは既知のバイト列を直接指定する。
  return new TextEncoder().encode(name); // ASCII専用(日本語ケースは個別に用意する)
}

// "テスト.txt" の Shift_JIS バイト列 (テ=0x83 0x65, ス=0x83 0x58, ト=0x83 0x67) + ".txt"
const SJIS_TEST_TXT = new Uint8Array([
  0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x2e, 0x74, 0x78, 0x74,
]);

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function u16le(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
}

function u32le(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
}

/** LZHヘッダレベル0の -lh0-(無圧縮) エントリを1つ組み立てる。 */
function buildLzhLevel0(nameBytes: Uint8Array, data: Uint8Array, crcOverride?: number): Uint8Array {
  const crc = crcOverride ?? crc16(data);
  const nameLen = nameBytes.length;
  const headerSize = 23 + nameLen; // 固定19バイト分(method~level) + namelen(1) + name + crc(2) + checksum(1) の合計から size byte を除いた値
  const header = concatBytes([
    new Uint8Array([headerSize, 0 /* checksum(未検証のため0固定) */]),
    new TextEncoder().encode('-lh0-'),
    u32le(data.length), // compressed size (無圧縮なのでdataそのまま)
    u32le(data.length), // original size
    u32le(0), // time
    new Uint8Array([0x20 /* attribute */, 0 /* level */, nameLen]),
    nameBytes,
    u16le(crc),
  ]);
  return concatBytes([header, data]);
}

/** LZHヘッダレベル1のエントリを組み立てる(拡張ヘッダでファイル名を上書き)。 */
function buildLzhLevel1(baseNameBytes: Uint8Array, extNameBytes: Uint8Array | null, data: Uint8Array): Uint8Array {
  const crc = crc16(data);
  const nameLen = baseNameBytes.length;
  const extChunk = extNameBytes
    ? concatBytes([u16le(3 + extNameBytes.length), new Uint8Array([0x01]), extNameBytes])
    : new Uint8Array(0);
  const extTerminator = u16le(0);
  const headerSize = 24 + nameLen; // level0相当(23+namelen)+OS ID(1byte)
  const header = concatBytes([
    new Uint8Array([headerSize, 0]),
    new TextEncoder().encode('-lh0-'),
    u32le(data.length),
    u32le(data.length),
    u32le(0),
    new Uint8Array([0x20, 1 /* level */, nameLen]),
    baseNameBytes,
    u16le(crc),
    new Uint8Array([0 /* OS ID */]),
    extChunk,
    extTerminator,
  ]);
  return concatBytes([header, data]);
}

// --- ZIPバイナリ組み立てヘルパー ------------------------------------------------------

interface ZipEntrySpec {
  name: string;
  data: Uint8Array;
  method: 0 | 8;
}

function buildZip(specs: ZipEntrySpec[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const spec of specs) {
    const nameBytes = new TextEncoder().encode(spec.name);
    const compressed = spec.method === 8 ? deflateRawSync(Buffer.from(spec.data)) : spec.data;
    const crc = crc32(spec.data);

    const localHeader = concatBytes([
      u32le(0x04034b50),
      u16le(20), // version needed
      u16le(0), // gp flag
      u16le(spec.method),
      u16le(0), // mod time
      u16le(0x21), // mod date (有効な日付にしておく)
      u32le(crc),
      u32le(compressed.length),
      u32le(spec.data.length),
      u16le(nameBytes.length),
      u16le(0), // extra len
      nameBytes,
    ]);
    const localOffset = offset;
    localParts.push(localHeader, compressed);
    offset += localHeader.length + compressed.length;

    const centralHeader = concatBytes([
      u32le(0x02014b50),
      u16le(20), // version made by
      u16le(20), // version needed
      u16le(0), // gp flag
      u16le(spec.method),
      u16le(0), // mod time
      u16le(0x21), // mod date
      u32le(crc),
      u32le(compressed.length),
      u32le(spec.data.length),
      u16le(nameBytes.length),
      u16le(0), // extra len
      u16le(0), // comment len
      u16le(0), // disk number start
      u16le(0), // internal attr
      u32le(0), // external attr
      u32le(localOffset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
  }

  const localSection = concatBytes(localParts);
  const centralSection = concatBytes(centralParts);
  const eocd = concatBytes([
    u32le(0x06054b50),
    u16le(0), // disk number
    u16le(0), // cd start disk
    u16le(specs.length),
    u16le(specs.length),
    u32le(centralSection.length),
    u32le(localSection.length), // cd offset = ローカルセクションの直後
    u16le(0), // comment length
  ]);

  return concatBytes([localSection, centralSection, eocd]);
}

// --- テスト本体 ------------------------------------------------------------------------

describe('isArchive', () => {
  it('拡張子.lzh/.zipを大文字小文字無視で判定する', () => {
    expect(isArchive('foo.lzh')).toBe(true);
    expect(isArchive('FOO.LZH')).toBe(true);
    expect(isArchive('foo.zip')).toBe(true);
    expect(isArchive('FOO.ZIP')).toBe(true);
    expect(isArchive('foo.txt')).toBe(false);
    expect(isArchive('foo.lzh.bak')).toBe(false);
  });
});

describe('LZH lh0(無圧縮)の展開', () => {
  it('レベル0ヘッダ・ASCIIファイル名の往復ができる', () => {
    const data = new TextEncoder().encode('Hello, PC-98!\n');
    const archive = buildLzhLevel0(sjisBytes('hello.txt'), data);
    const entries = extractLzh(archive);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('hello.txt');
    expect(new TextDecoder().decode(entries[0].data)).toBe('Hello, PC-98!\n');
  });

  it('Shift_JISファイル名を正しくデコードする', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const archive = buildLzhLevel0(SJIS_TEST_TXT, data);
    const entries = extractLzh(archive);
    expect(entries[0].name).toBe('テスト.txt');
    expect(Array.from(entries[0].data)).toEqual([1, 2, 3, 4, 5]);
  });

  it('レベル1ヘッダの拡張ヘッダでファイル名が上書きされる', () => {
    const data = new TextEncoder().encode('level1 body');
    const archive = buildLzhLevel1(sjisBytes('base.txt'), sjisBytes('override.txt'), data);
    const entries = extractLzh(archive);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('override.txt');
    expect(new TextDecoder().decode(entries[0].data)).toBe('level1 body');
  });

  it('複数エントリを順番に展開できる', () => {
    const e1 = buildLzhLevel0(sjisBytes('a.txt'), new TextEncoder().encode('AAA'));
    const e2 = buildLzhLevel0(sjisBytes('b.txt'), new TextEncoder().encode('BBBB'));
    const archive = concatBytes([e1, e2]);
    const entries = extractLzh(archive);
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'b.txt']);
    expect(new TextDecoder().decode(entries[1].data)).toBe('BBBB');
  });

  it('CRC16が不一致の場合は例外を投げる', () => {
    const data = new TextEncoder().encode('corrupt me');
    const wrongCrc = (crc16(data) ^ 0xffff) & 0xffff;
    const archive = buildLzhLevel0(sjisBytes('bad.txt'), data, wrongCrc);
    expect(() => extractLzh(archive)).toThrow(/CRC16/);
  });
});

describe('LZH lh5(LZSS+ハフマン)の実データ展開', () => {
  // 実データフィクスチャは著作権・プライバシー上の理由でgit管理外(test/fixtures/lzh/は.gitignore)。
  // ローカルに実物のLZHから切り出して配置した環境でのみ実行され、無ければスキップされる。
  // 過去に見つかった回帰の再現用フィクスチャ:
  // - bran3r_entry0.lzh: レベル1ヘッダ+lh5、1エントリ(約420KB)。実アーカイブの1エントリを
  //   そのまま切り出したもの。複数ブロックにまたがり、readPtLen の延長ビット(コード長7以上)
  //   処理の停止ビット消費漏れによる1ビットずつのビット列ズレ(2ブロック目以降で不正な
  //   ハフマン符号やCRC不一致として顕在化する)を再現する。
  // - log.lzh: レベル2ヘッダ+lh5、1エントリ(約87KB)。拡張ヘッダ列の開始位置計算が
  //   レベルごとに異なる規約を正しく扱えているかを確認する。
  it.skipIf(!hasFixture('bran3r_entry0.lzh'))('レベル1ヘッダ・複数ブロックの実データを正しく展開できる(BRAN3R_0)', () => {
    const archive = readFixture('bran3r_entry0.lzh');
    const entries = extractLzh(archive);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('BRAN3R_0');
    expect(entries[0].data).toHaveLength(1261824);
    expect(sha256Hex(entries[0].data)).toBe(
      '1fd80b947743128a6f76d4e49fbf5b153d258f059279a2a2dbb5b0b326ff7460',
    );
  });

  it.skipIf(!hasFixture('log.lzh'))('レベル2ヘッダの実データを正しく展開できる(log.txt)', () => {
    const archive = readFixture('log.lzh');
    const entries = extractLzh(archive);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('log.txt');
    expect(entries[0].data).toHaveLength(244224);
    expect(sha256Hex(entries[0].data)).toBe(
      '617e32810140656f58c90eb81020abc1af62a54be3e7a6c9920b84a2d445800c',
    );
  });
});

describe('extractArchive経由でのLZH展開', () => {
  it('.lzh拡張子でLZHとして展開される', async () => {
    const data = new TextEncoder().encode('via extractArchive');
    const archive = buildLzhLevel0(sjisBytes('x.txt'), data);
    const entries = await extractArchive('sample.lzh', archive);
    expect(entries[0].name).toBe('x.txt');
  });

  it('未対応の拡張子はエラーになる', async () => {
    await expect(extractArchive('sample.rar', new Uint8Array(0))).rejects.toThrow();
  });
});

describe('ZIPの展開', () => {
  it('stored(無圧縮)エントリを展開できる', async () => {
    const data = new TextEncoder().encode('stored data 12345');
    const archive = buildZip([{ name: 'stored.txt', data, method: 0 }]);
    const entries = await extractArchive('sample.zip', archive);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('stored.txt');
    expect(new TextDecoder().decode(entries[0].data)).toBe('stored data 12345');
  });

  it('deflateエントリを展開できる', async () => {
    const data = new TextEncoder().encode('deflate me '.repeat(50));
    const archive = buildZip([{ name: 'deflated.txt', data, method: 8 }]);
    const entries = await extractArchive('sample.zip', archive);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('deflated.txt');
    expect(new TextDecoder().decode(entries[0].data)).toBe('deflate me '.repeat(50));
  });

  it('stored/deflateが混在する複数エントリを展開できる', async () => {
    const d1 = new TextEncoder().encode('first entry');
    const d2 = new TextEncoder().encode('second entry, repeated. '.repeat(20));
    const archive = buildZip([
      { name: 'first.txt', data: d1, method: 0 },
      { name: 'second.txt', data: d2, method: 8 },
    ]);
    const entries = await extractArchive('multi.zip', archive);
    expect(entries.map((e) => e.name)).toEqual(['first.txt', 'second.txt']);
    expect(new TextDecoder().decode(entries[0].data)).toBe('first entry');
    expect(new TextDecoder().decode(entries[1].data)).toBe(new TextDecoder().decode(d2));
  });

  it('CRC32が不一致の場合は例外を投げる', async () => {
    const data = new TextEncoder().encode('will be corrupted');
    const archive = buildZip([{ name: 'bad.txt', data, method: 0 }]);
    // Central DirectoryのCRC32フィールドを壊す(オフセットは概算のため実データを壊す代わりにデータ側を書き換える)。
    const corrupted = new Uint8Array(archive);
    // ローカルヘッダ直後のデータ部分(先頭バイト)を反転させ、CRC32のみ元のまま(=不一致)にする。
    const dataOffset = 30 + new TextEncoder().encode('bad.txt').length;
    corrupted[dataOffset] ^= 0xff;
    await expect(extractArchive('bad.zip', corrupted)).rejects.toThrow(/CRC32/);
  });
});
