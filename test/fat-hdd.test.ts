import { describe, expect, it } from 'vitest';
import {
  DiskError,
  createFormattedHdd,
  fatFreeSpace,
  fatList,
  fatMakeDir,
  fatReadFile,
  fatWriteFile,
  openDiskImage,
} from '../src/api/fat.ts';

// 実イメージ(public/test/HDDimage.thd)は124MBかつ再配布不可のため、
// ここでは同じジオメトリ(T98 .thd: 8ヘッド×33セクタ×256B、ヘッダ256B)の
// 小さな合成イメージを組み立てて検証する。

const HEADER_SIZE = 256;
const SURFACES = 8;
const SECTORS_PER_TRACK = 33;
const PHYSICAL_SECTOR_SIZE = 256;
const BYTES_PER_CYLINDER = SURFACES * SECTORS_PER_TRACK * PHYSICAL_SECTOR_SIZE;

/** FAT16パーティションのBPBパラメータ(実イメージと同じ2048B/sector)。 */
const BYTES_PER_SECTOR = 2048;
const SECTORS_PER_CLUSTER = 2;
const RESERVED_SECTORS = 1;
const NUM_FATS = 2;
const ROOT_ENTRIES = 512;
const SECTORS_PER_FAT = 20;
/** FAT16と判定させるためクラスタ数が4085以上になるセクタ数にする。 */
const TOTAL_SECTORS = 9000;

function writeU16(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xff;
  buf[off + 1] = (val >> 8) & 0xff;
}

/**
 * 指定シリンダから始まるFAT16パーティションを1つ持つ .thd 相当のイメージを作る。
 * ヘッダ・パーティションテーブル・BPB・FAT先頭のみを書き、残りは0埋め。
 */
function buildThd(startCylinder: number): Uint8Array {
  const partitionOffset = HEADER_SIZE + startCylinder * BYTES_PER_CYLINDER;
  const image = new Uint8Array(partitionOffset + TOTAL_SECTORS * BYTES_PER_SECTOR);

  // THDヘッダ: 先頭ワードがシリンダ数。
  writeU16(image, 0, startCylinder + Math.ceil((TOTAL_SECTORS * BYTES_PER_SECTOR) / BYTES_PER_CYLINDER));

  // パーティションテーブル(物理セクタ1)の先頭エントリ。
  const entry = HEADER_SIZE + PHYSICAL_SECTOR_SIZE;
  image[entry] = 0xa1; // ブート可能フラグ
  image[entry + 1] = 0x91; // システムID(MS-DOS)
  image[entry + 8] = 0; // 開始セクタ
  image[entry + 9] = 0; // 開始ヘッド
  writeU16(image, entry + 10, startCylinder); // 開始シリンダ
  for (let i = 0; i < 11; i++) image[entry + 16 + i] = 'MS-DOS 6.20'.charCodeAt(i);

  // パーティション先頭のブートセクタ(BPB)。
  const p = partitionOffset;
  image[p] = 0xeb;
  image[p + 1] = 0xfe;
  image[p + 2] = 0x90;
  writeU16(image, p + 11, BYTES_PER_SECTOR);
  image[p + 13] = SECTORS_PER_CLUSTER;
  writeU16(image, p + 14, RESERVED_SECTORS);
  image[p + 16] = NUM_FATS;
  writeU16(image, p + 17, ROOT_ENTRIES);
  writeU16(image, p + 19, TOTAL_SECTORS);
  image[p + 21] = 0xf8;
  writeU16(image, p + 22, SECTORS_PER_FAT);
  writeU16(image, p + 24, SECTORS_PER_TRACK);
  writeU16(image, p + 26, SURFACES);
  image[p + 510] = 0x55;
  image[p + 511] = 0xaa;

  // FAT先頭の予約エントリ(メディアバイト + EOC)。
  for (let f = 0; f < NUM_FATS; f++) {
    const base = p + (RESERVED_SECTORS + f * SECTORS_PER_FAT) * BYTES_PER_SECTOR;
    image[base] = 0xf8;
    image[base + 1] = 0xff;
    image[base + 2] = 0xff;
    image[base + 3] = 0xff;
  }
  return image;
}

describe('openDiskImage: HDDイメージ', () => {
  it('THDヘッダとパーティションテーブルからFAT16パーティションを開く', () => {
    const vol = openDiskImage(buildThd(1), 'disk.thd');
    // ヘッダ256B + 1シリンダ(8×33×256=67584) = 0x10900。実イメージと同じ値になる。
    expect(vol.imageOffset).toBe(0x10900);
    expect(vol.fatType).toBe('FAT16');
    expect(vol.bytesPerSector).toBe(BYTES_PER_SECTOR);
  });

  it('開始シリンダが異なるパーティションでもオフセットを正しく求める', () => {
    const vol = openDiskImage(buildThd(3), 'disk.thd');
    expect(vol.imageOffset).toBe(HEADER_SIZE + 3 * BYTES_PER_CYLINDER);
  });

  it('HDDパーティション内でファイルの書き込みと読み出しができる', () => {
    const image = buildThd(1);
    const vol = openDiskImage(image, 'disk.thd');
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    fatWriteFile(vol, 'HELLO.TXT', data);

    // 書き戻し後のバイト列を開き直しても内容が保持されていること。
    const reopened = openDiskImage(image, 'disk.thd');
    expect(fatList(reopened, '').map((e) => e.name)).toContain('HELLO.TXT');
    expect(Array.from(fatReadFile(reopened, 'HELLO.TXT'))).toEqual([1, 2, 3, 4, 5]);
  });

  it('NHD/Virtual98のシグネチャが不正ならDiskErrorにする(UIで言語別に出し分けるため)', () => {
    expect(() => openDiskImage(new Uint8Array(0x200), 'disk.nhd')).toThrow(DiskError);
    try {
      openDiskImage(new Uint8Array(0x200), 'disk.nhd');
    } catch (err) {
      expect((err as DiskError).code).toBe('hddInvalidHeader');
      expect((err as DiskError).params.format).toBe('NHD');
    }
    try {
      openDiskImage(new Uint8Array(0x200), 'disk.hdd');
    } catch (err) {
      expect((err as DiskError).code).toBe('hddInvalidHeader');
      expect((err as DiskError).params.format).toBe('Virtual98(.hdd)');
    }
  });

  it('FATパーティションが1つも無ければ hddNoFatPartition のDiskErrorにする', () => {
    try {
      openDiskImage(new Uint8Array(HEADER_SIZE + BYTES_PER_CYLINDER), 'disk.thd');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DiskError);
      expect((err as DiskError).code).toBe('hddNoFatPartition');
    }
  });
});

describe('createFormattedHdd', () => {
  const image = createFormattedHdd();

  it('NP2kaiが標準SASIと認識するジオメトリ(33セクタ×8ヘッド×615シリンダ)で作る', () => {
    // THDヘッダ(256B) + 615シリンダ × 67584B
    expect(image.length).toBe(256 + 615 * 8 * 33 * 256);
    expect(image[0] | (image[1] << 8)).toBe(615);
  });

  it('第0シリンダにIPLシグネチャとパーティションテーブルを置く', () => {
    expect(String.fromCharCode(...image.subarray(256 + 4, 256 + 8))).toBe('IPL1');
    expect(image[256 + 254]).toBe(0x55);
    expect(image[256 + 255]).toBe(0xaa);
    const entry = 256 + 256;
    expect(image[entry]).toBe(0xa1);
    expect(image[entry + 1]).toBe(0x91);
    // 開始シリンダ1、終了シリンダ614(=1..614の614シリンダ分)
    expect(image[entry + 10] | (image[entry + 11] << 8)).toBe(1);
    expect(image[entry + 14] | (image[entry + 15] << 8)).toBe(614);
  });

  it('生成直後のイメージをFAT16として開けて、中身が空である', () => {
    const vol = openDiskImage(image, 'blank.thd');
    expect(vol.imageOffset).toBe(0x10900);
    expect(vol.fatType).toBe('FAT16');
    expect(vol.bytesPerSector).toBe(2048);
    expect(fatList(vol, '')).toEqual([]);
    const { free, total } = fatFreeSpace(vol);
    expect(free).toBe(total);
    // 40MBのSASI HDD相当の空き容量になっている(FAT/ルート領域ぶんは差し引かれる)。
    expect(total).toBeGreaterThan(39 * 1024 * 1024);
  });

  it('FATが全クラスタを表現できるサイズになっている', () => {
    const vol = openDiskImage(image, 'blank.thd');
    const fatBytesNeeded = (vol.totalClusters + 2) * 2;
    expect(vol.sectorsPerFat * vol.bytesPerSector).toBeGreaterThanOrEqual(fatBytesNeeded);
    // FAT16の下限(4085クラスタ)を上回り、FAT12と誤判定されない。
    expect(vol.totalClusters).toBeGreaterThan(4085);
  });

  it('生成したブランクHDDに書き込み・ディレクトリ作成ができる', () => {
    const fresh = createFormattedHdd();
    const vol = openDiskImage(fresh, 'blank.thd');
    fatWriteFile(vol, 'README.TXT', new Uint8Array([1, 2, 3]));
    fatMakeDir(vol, 'GAMES');
    const reopened = openDiskImage(fresh, 'blank.thd');
    expect(fatList(reopened, '').map((e) => e.name).sort()).toEqual(['GAMES', 'README.TXT']);
    expect(Array.from(fatReadFile(reopened, 'README.TXT'))).toEqual([1, 2, 3]);
  });
});
