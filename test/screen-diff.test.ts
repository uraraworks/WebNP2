import { describe, expect, it } from 'vitest';
import { diffScreens, ScreenOutputTracker, type CursorPos, type ScreenEvent } from '../src/api/screen-diff.ts';
import real from './fixtures/screen-diff-real.json';

// 合成画面: 25行。content は先頭から詰める。
const R = 25;
function screen(content: string[]): string[] {
  const l = content.slice();
  while (l.length < R) l.push('');
  return l;
}
const at = (row: number, col = 0): CursorPos => ({ row, col });
const types = (evs: ScreenEvent[]): string[] => evs.map((e) => e.type);

describe('diffScreens (合成)', () => {
  it('変化なしなら空配列', () => {
    const s = screen(['A:\\>']);
    expect(diffScreens(s, at(0, 4), s, at(0, 4))).toEqual([]);
  });

  it('初回は非空行を line、カーソル行を pending で流す', () => {
    const evs = diffScreens(null, null, screen(['hello', 'world', 'A:\\>']), at(2, 4));
    expect(evs).toEqual([
      { type: 'line', text: 'hello' },
      { type: 'line', text: 'world' },
      { type: 'pending', text: 'A:\\>' },
    ]);
  });

  it('1行追記: 入力行が確定し、出力と新しい pending が出る', () => {
    const prev = screen(['A:\\>ver'], );
    const next = screen(['A:\\>ver', 'FreeCOM 0.85', 'A:\\>']);
    expect(diffScreens(prev, at(0, 7), next, at(2, 4))).toEqual([
      { type: 'line', text: 'A:\\>ver' },
      { type: 'line', text: 'FreeCOM 0.85' },
      { type: 'pending', text: 'A:\\>' },
    ]);
  });

  it('打鍵: 入力行の延長は pending だけ、バックスペースの縮みも pending', () => {
    const a = screen(['x', 'A:\\>d']);
    const b = screen(['x', 'A:\\>di']);
    expect(diffScreens(a, at(1, 5), b, at(1, 6))).toEqual([{ type: 'pending', text: 'A:\\>di' }]);
    expect(diffScreens(b, at(1, 6), a, at(1, 5))).toEqual([{ type: 'pending', text: 'A:\\>d' }]);
  });

  it('数行スクロール: 重複せず新しい行だけ出る', () => {
    const rows = Array.from({ length: 24 }, (_, i) => `line${i}`);
    const prev = [...rows, 'A:\\>cmd'];
    // 3行出力 → 3行スクロール (prev の行3.. が上へ)
    const next = [...rows.slice(3), 'A:\\>cmd', 'out1', 'out2', 'A:\\>'];
    expect(next.length).toBe(R);
    const evs = diffScreens(prev, at(24, 7), next, at(24, 4));
    expect(evs).toEqual([
      { type: 'line', text: 'A:\\>cmd' },
      { type: 'line', text: 'out1' },
      { type: 'line', text: 'out2' },
      { type: 'pending', text: 'A:\\>' },
    ]);
  });

  it('画面消去: clear + 新しい pending', () => {
    const prev = screen(['a', 'b', 'A:\\>cls']);
    const next = screen(['A:\\>']);
    expect(diffScreens(prev, at(2, 7), next, at(0, 4))).toEqual([
      { type: 'clear' },
      { type: 'pending', text: 'A:\\>' },
    ]);
  });

  it('カーソルより下に文字がある全面書き換えは takeover', () => {
    const prev = screen(['a', 'b', 'A:\\>edit']);
    const next = screen(['┌menu', '│ item', '└─────', '', '', 'status']);
    expect(types(diffScreens(prev, at(2, 8), next, at(1, 3)))).toEqual(['takeover']);
  });

  it('行数を超えるスクロール: gap のあと現在画面を流す', () => {
    const prev = screen(['A:\\>type big.txt']);
    const next = Array.from({ length: 24 }, (_, i) => `row${i + 100}`).concat(['A:\\>']);
    const evs = diffScreens(prev, at(0, 16), next, at(24, 4));
    expect(evs[0]).toEqual({ type: 'gap' });
    expect(evs.slice(1, -1).map((e) => (e as { text: string }).text)).toEqual(next.slice(0, 24));
    expect(evs[evs.length - 1]).toEqual({ type: 'pending', text: 'A:\\>' });
  });

  it('空行・短い行だけが一致しても大きなスクロールとは見なさない(偶然一致の防止)', () => {
    // 前回: 下端にカーソル、上は空行だらけ。次: 全く別の内容で先頭が空行
    const prev = screen([]);
    prev[24] = 'A:\\>';
    const next = ['', ...Array.from({ length: 23 }, (_, i) => `new${i}`), 'A:\\>'];
    expect(diffScreens(prev, at(24, 4), next, at(24, 4))[0]).toEqual({ type: 'gap' });
  });

  it('cursor が null: 最後の非空行を入力中の行とみなす', () => {
    const a = screen(['MEMORY 128KB OK']);
    const b = screen(['MEMORY 256KB OK']);
    expect(diffScreens(a, null, b, null)).toEqual([{ type: 'pending', text: 'MEMORY 256KB OK' }]);
    const c = screen(['MEMORY 256KB OK', 'next stage']);
    expect(diffScreens(b, null, c, null)).toEqual([
      { type: 'line', text: 'MEMORY 256KB OK' },
      { type: 'pending', text: 'next stage' },
    ]);
  });

  it("'.' だけの行(未初期化セル)は空行扱い", () => {
    const a = screen(['.']);
    expect(diffScreens(null, null, a, null)).toEqual([]);
  });
});

describe('ScreenOutputTracker', () => {
  it('同じ画面が2回続くまで確定しない(スクロール途中の読みで誤 gap を出さない)', () => {
    const t = new ScreenOutputTracker();
    const base = screen(['one', 'two', 'A:\\>']);
    expect(t.push(base, at(2, 4))).toEqual([]); // 候補
    expect(types(t.push(base, at(2, 4)))).toEqual(['line', 'line', 'pending']);
    // スクロール途中で壊れた画面 → 次に正しい画面。壊れた方は確定されない
    const torn = screen(['one', 'two', 'A:\\>x', 'garb\u0000']);
    const good = screen(['one', 'two', 'A:\\>x', 'out', 'A:\\>']);
    expect(t.push(torn, at(3, 0))).toEqual([]);
    expect(t.push(good, at(4, 4))).toEqual([]);
    expect(types(t.push(good, at(4, 4)))).toEqual(['line', 'line', 'pending']);
  });

  it('最下行の固定表示(ファンクションキー行)を除外する', () => {
    const t = new ScreenOutputTracker();
    const fkey = '  C1  CU  CA';
    const s1 = screen(['hi', 'A:\\>']);
    s1[24] = fkey;
    t.push(s1, at(1, 4));
    expect(t.push(s1, at(1, 4))).toEqual([
      { type: 'line', text: 'hi' },
      { type: 'pending', text: 'A:\\>' },
    ]);
    const s2 = screen(['hi', 'A:\\>a']);
    s2[24] = fkey;
    t.push(s2, at(1, 5));
    expect(t.push(s2, at(1, 5))).toEqual([{ type: 'pending', text: 'A:\\>a' }]);
  });

  it('行数0(コア初期化前)は無視する', () => {
    const t = new ScreenOutputTracker();
    expect(t.push([], null)).toEqual([]);
  });

  it('takeover は連続して出さない', () => {
    const t = new ScreenOutputTracker();
    const a = screen(['a', 'A:\\>x']);
    t.push(a, at(1, 4));
    t.push(a, at(1, 4));
    const m1 = screen(['┌', '│', '└', '', '', 'bar']);
    const m2 = screen(['┌', '│X', '└', '', '', 'bar']);
    t.push(m1, at(1, 1));
    expect(types(t.push(m1, at(1, 1)))).toEqual(['takeover']);
    t.push(m2, at(1, 2));
    expect(t.push(m2, at(1, 2))).toEqual([]);
  });
});

// 実機(FreeDOS(98) / 25行・最下行はファンクションキー行)で採取した前後の画面。
describe('diffScreens (実機fixture)', () => {
  type Pair = { prev: { lines: string[]; cursor: CursorPos }; next: { lines: string[]; cursor: CursorPos } };
  const fx = real as unknown as Record<string, Pair>;
  // 実機の最下行は固定表示なので、Tracker と同じく除外してから渡す。
  const run = (p: Pair): ScreenEvent[] => {
    const strip = (l: string[]) => l.slice(0, l.length - 1);
    return diffScreens(strip(p.prev.lines), p.prev.cursor, strip(p.next.lines), p.next.cursor);
  };

  it('打鍵 "A:\\>di" -> "A:\\>dir" は pending だけ', () => {
    expect(run(fx.typing)).toEqual([{ type: 'pending', text: 'A:\\>dir' }]);
  });

  it('mem の出力(スクロールを伴う)が重複なく確定行として流れ、末尾が新しいプロンプト', () => {
    const evs = run(fx.mem);
    const lines = evs.filter((e) => e.type === 'line').map((e) => (e as { text: string }).text);
    expect(lines[0]).toBe('A:\\>mem');
    expect(lines.some((l) => l.startsWith('Largest executable'))).toBe(true);
    // 重複も欠落もない: 出た行は、次の画面で入力行(echo)から最下行の手前までと完全に一致する
    const rows = fx.mem.next.lines.slice(0, 24);
    expect(lines).toEqual(rows.slice(rows.indexOf('A:\\>mem'), 23));
    expect(evs[evs.length - 1]).toEqual({ type: 'pending', text: 'A:\\>' });
    expect(types(evs)).not.toContain('takeover');
    expect(types(evs)).not.toContain('gap');
  });

  it('dir が1回のポーリングで画面を超えて流れた: gap を明示する(takeover にしない)', () => {
    const evs = run(fx.dir_overflow);
    expect(evs[0]).toEqual({ type: 'gap' });
    expect(types(evs)).not.toContain('takeover');
    expect(evs.some((e) => e.type === 'line' && e.text.includes('個のファイル'))).toBe(true);
    expect(evs[evs.length - 1]).toEqual({ type: 'pending', text: 'A:\\>' });
  });

  it('cls は clear + プロンプト', () => {
    expect(run(fx.cls)).toEqual([{ type: 'clear' }, { type: 'pending', text: 'A:\\>' }]);
  });

  it('起動中にカーネルが画面を書き直す: clear + 先頭行から', () => {
    const evs = run(fx.kernel_rewrite);
    expect(evs[0]).toEqual({ type: 'clear' });
    expect(evs[1]).toMatchObject({ type: 'line', text: expect.stringContaining('FreeDOS(98) kernel') });
  });

  it('type で全画面分が一度に流れた: gap を明示し、現在画面の全行を流す', () => {
    const evs = run(fx.fast_scroll_gap);
    expect(evs[0]).toEqual({ type: 'gap' });
    const lines = evs.filter((e) => e.type === 'line');
    expect(lines.length).toBe(23);
    expect(evs[evs.length - 1]).toMatchObject({ type: 'pending' });
  });
});
