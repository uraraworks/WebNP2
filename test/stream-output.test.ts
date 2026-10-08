import { describe, expect, it } from 'vitest';
import { StreamOutputParser } from '../src/api/stream-output.ts';
import type { ScreenEvent } from '../src/api/screen-diff.ts';

const enc = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const ESC = '\x1b';

function run(chunks: Array<string | number[]>, seed?: string): ScreenEvent[] {
  const p = new StreamOutputParser();
  if (seed !== undefined) p.seed(seed);
  const out: ScreenEvent[] = [];
  for (const c of chunks) out.push(...p.push(typeof c === 'string' ? enc(c) : c));
  return out;
}
const lines = (evs: ScreenEvent[]): string[] =>
  evs.filter((e): e is { type: 'line'; text: string } => e.type === 'line').map((e) => e.text);
const lastPending = (evs: ScreenEvent[]): string | undefined =>
  [...evs].reverse().find((e): e is { type: 'pending'; text: string } => e.type === 'pending')?.text;

describe('StreamOutputParser', () => {
  it('CRLF で line を確定し、未確定の行は pending に出る', () => {
    const evs = run(['abc\r\ndef\r\nA:\\>']);
    expect(lines(evs)).toEqual(['abc', 'def']);
    expect(lastPending(evs)).toBe('A:\\>');
  });

  it('空行も line になる', () => {
    expect(lines(run(['a\r\n\r\nb\r\n']))).toEqual(['a', '', 'b']);
  });

  it('チャンクの切れ目をまたいでも同じ結果(1バイトずつでも)', () => {
    const s = 'hello\r\nworld\r\nA:\\>dir';
    const whole = run([s]);
    const bytewise = run(Array.from(s, (c) => c));
    expect(lines(bytewise)).toEqual(lines(whole));
    expect(lastPending(bytewise)).toBe('A:\\>dir');
  });

  it('pending は変化したときだけ出る', () => {
    const p = new StreamOutputParser();
    expect(p.push(enc('ab'))).toEqual([{ type: 'pending', text: 'ab' }]);
    expect(p.push([])).toEqual([]);
    expect(p.push(enc('c'))).toEqual([{ type: 'pending', text: 'abc' }]);
  });

  it('BS は桁を戻すだけで、"\\b \\b" のエコーで消える', () => {
    const evs = run(['A:\\>dix\b \b', 'r\r\n']);
    expect(lines(evs)).toEqual(['A:\\>dir']);
  });

  it('CR だけで行頭へ戻ったら上書きになる(最後の内容だけが line)', () => {
    const evs = run(['10%\r50%\r100%\r\n']);
    expect(lines(evs)).toEqual(['100%']);
  });

  it('TAB は次の8の倍数桁へ進み、空白に展開される', () => {
    expect(lines(run(['a\tb\r\n']))).toEqual(['a       b']);
  });

  it('行末の空白は削る', () => {
    expect(lines(run(['abc   \r\n']))).toEqual(['abc']);
  });

  it('Shift_JIS の全角文字を復号する(2バイトの間でチャンクが切れても)', () => {
    // 「漢字」= 8A BF 8E 9A
    const evs = run([[0x8a], [0xbf, 0x8e], [0x9a, 0x0d, 0x0a]]);
    expect(lines(evs)).toEqual(['漢字']);
  });

  it('半角カナは半角のまま出る', () => {
    expect(lines(run([[0xb1, 0xb2, 0x0d, 0x0a]]))).toEqual(['ｱｲ']);
  });

  it('全角文字を ASCII で上書きしても相方の半分が残らない', () => {
    const evs = run([[0x8a, 0xbf, 0x0d, 0x41, 0x0d, 0x0a]]);
    expect(lines(evs)).toEqual(['A']);
  });

  it('ESC[2J は clear。行バッファも捨てる', () => {
    const evs = run(['junk', `${ESC}[2J`, 'A:\\>']);
    expect(evs.map((e) => e.type)).toContain('clear');
    expect(lines(evs)).toEqual([]);
    expect(lastPending(evs)).toBe('A:\\>');
  });

  it('色指定・モード設定は無視される', () => {
    const evs = run([`${ESC}[m${ESC}[1;32mok${ESC}[m${ESC}[>1h\r\n`]);
    expect(lines(evs)).toEqual(['ok']);
    expect(evs.some((e) => e.type === 'takeover' || e.type === 'clear')).toBe(false);
  });

  it('ESC[K は行末まで消す', () => {
    const evs = run([`abcdef\r${ESC}[3C${ESC}[K\r\n`]);
    expect(lines(evs)).toEqual(['abc']);
  });

  it('FreeCOM の入力行再描画(行番号つき桁指定)は入力行の編集として扱う', () => {
    // 実測: プロンプト "A:\>" のあと "ver" を打つ → 1打鍵ごとに ESC[24;05H で桁を指定して描き直す
    const typed = [
      'A:\\>',
      `${ESC}[24;05H ${ESC}[24;05Hv${ESC}[24;06H`,
      `${ESC}[24;05H  ${ESC}[24;05Hve${ESC}[24;07H`,
      `${ESC}[24;06H  ${ESC}[24;06Her${ESC}[24;08H`,
    ];
    const evs = run(typed);
    expect(evs.some((e) => e.type === 'takeover')).toBe(false);
    expect(lastPending(evs)).toBe('A:\\>ver');
    const done = run([...typed, '\r\n\r\nFreeCom ver\r\nA:\\>']);
    expect(lines(done)).toEqual(['A:\\>ver', '', 'FreeCom ver']);
  });

  it('seed した入力行へ続けて桁指定されても行頭が崩れない', () => {
    const evs = run([`${ESC}[24;05H ${ESC}[24;05Hd${ESC}[24;06H`], 'A:\\>');
    expect(evs.some((e) => e.type === 'takeover')).toBe(false);
    expect(lastPending(evs)).toBe('A:\\>d');
  });

  it('別の行への桁指定(全画面アプリ)は takeover を1回だけ出し、出力を捨てる', () => {
    const evs = run([`${ESC}[2J${ESC}[1;1Hhello${ESC}[5;10Hworld${ESC}[20;1Hfoo`]);
    expect(evs.filter((e) => e.type === 'takeover')).toHaveLength(1);
    expect(lines(evs)).toEqual([]);
  });

  it('桁指定のあと表示文字を挟んだ LF で takeover を抜け、通常出力が戻る', () => {
    const evs = run([`${ESC}[2J${ESC}[5;5Hmenu\r\n`, 'A:\\>dir\r\n']);
    expect(lines(evs)).toEqual(['A:\\>dir']);
  });

  it('ESC[A, ESC[L など他のカーソル/行操作も takeover', () => {
    for (const seq of [`${ESC}[A`, `${ESC}[2B`, `${ESC}[L`, `${ESC}[M`, `${ESC}=  `]) {
      const evs = run([`x${seq}`]);
      expect(evs.some((e) => e.type === 'takeover')).toBe(true);
    }
  });

  it('未知の ESC シーケンスは無視する', () => {
    expect(lines(run([`${ESC})0a${ESC}Zb\r\n`]))).toEqual(['ab']);
  });

  it('gap: 行を捨て、次の LF までの断片は line にしない', () => {
    const p = new StreamOutputParser();
    p.push(enc('partial'));
    const g = p.gap();
    expect(g[0]).toEqual({ type: 'gap' });
    const evs = p.push(enc('tail of cut line\r\nnext\r\nA:\\>'));
    expect(lines(evs)).toEqual(['next']);
    expect(lastPending(evs)).toBe('A:\\>');
  });

  it('seed: 画面側の入力行を引き継ぐ', () => {
    const evs = run(['dir\r\n'], 'A:\\>');
    expect(lines(evs)).toEqual(['A:\\>dir']);
  });

  it('実測の type COPYING 1行目: INT 29h には TAB が届かず(ゲストが空白17個へ展開済み)、そのまま出る', () => {
    // 生バイト(2026-10-08 採取): ...ESC[24;17H CR LF <0x20 x17> "GNU GENERAL PUBLIC LICENSE" CR LF
    const raw = `${ESC}[24;17H\r\n${' '.repeat(17)}GNU GENERAL PUBLIC LICENSE\r\n${' '.repeat(23)}Version 2\r\n`;
    const evs = run([`A:\\>type COPYING`, raw], undefined);
    expect(lines(evs).slice(-2)).toEqual([`${' '.repeat(17)}GNU GENERAL PUBLIC LICENSE`, `${' '.repeat(23)}Version 2`]);
  });
});
