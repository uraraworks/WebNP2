import { describe, expect, it } from 'vitest';
import { selectCoreVariant } from '../src/core/module.ts';

describe('selectCoreVariant', () => {
  it('対応状況に応じて選択する', () => {
    expect(selectCoreVariant(null, true)).toBe('jspi');
    expect(selectCoreVariant(null, false)).toBe('full');
    expect(selectCoreVariant('other', true)).toBe('jspi');
  });
  it('URL指定を対応状況より優先する', () => {
    expect(selectCoreVariant('0', true)).toBe('full');
    expect(selectCoreVariant('1', false)).toBe('jspi');
  });
});
