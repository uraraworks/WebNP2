import { describe, expect, it } from 'vitest';
import { shouldPresent } from '../src/ui/sharp-view.ts';

describe('shouldPresent', () => {
  it('カウント不変なら描かない', () => expect(shouldPresent(5, 5, false, true)).toBe(false));
  it('カウントが変化したら描く', () => expect(shouldPresent(6, 5, false, true)).toBe(true));
  it('強制時は描く', () => expect(shouldPresent(5, 5, true, true)).toBe(true));
  it('関数がない場合は描く', () => expect(shouldPresent(undefined, undefined, false, true)).toBe(true));
  it('sharpsync=0では毎回描く', () => expect(shouldPresent(5, 5, false, false)).toBe(true));
});
