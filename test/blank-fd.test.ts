import { describe, expect, it } from 'vitest';
import { createFormattedFd, fatList, fatReadFile, fatWriteFile, openDiskImage } from '../src/api/fat.ts';

describe('createFormattedFd', () => {
  it('PC-98 2HD(1.2MB)ベタイメージのサイズになっている', () => {
    const image = createFormattedFd();
    expect(image.length).toBe(1_261_568);
  });

  it('生成直後のイメージをFAT12として開けて、中身が空である', () => {
    const image = createFormattedFd();
    const vol = openDiskImage(image, 'blank.xdf');
    expect(vol.fatType).toBe('FAT12');
    expect(fatList(vol, '')).toEqual([]);
  });

  it('生成したブランクFDに書き込み・読み出しができる(ラウンドトリップ)', () => {
    const image = createFormattedFd();
    const vol = openDiskImage(image, 'blank.xdf');
    fatWriteFile(vol, 'HELLO.TXT', new Uint8Array([1, 2, 3, 4, 5]));

    // 書き戻し後のバイト列を開き直しても内容が保持されていること。
    const reopened = openDiskImage(image, 'blank.xdf');
    expect(fatList(reopened, '').map((e) => e.name)).toEqual(['HELLO.TXT']);
    expect(Array.from(fatReadFile(reopened, 'HELLO.TXT'))).toEqual([1, 2, 3, 4, 5]);
  });
});
