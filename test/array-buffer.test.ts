import { describe, expect, it } from 'vitest';
import { arrayBufferOf } from '../src/api/array-buffer';

describe('arrayBufferOf', () => {
  it('バッファ全体のビューはコピーしない', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(arrayBufferOf(bytes)).toBe(bytes.buffer);
  });

  it('部分ビューは該当範囲だけをコピーする', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).subarray(1, 3);
    const result = arrayBufferOf(bytes);
    expect(result).not.toBe(bytes.buffer);
    expect([...new Uint8Array(result)]).toEqual([2, 3]);
  });
});
