import { describe, expect, it } from 'vitest';
import { ConhookReader, type ReadMem } from '../src/api/conhook.ts';

const SEG = 0x0800;
const HDR = SEG * 16 + 0x103;
const BUFOFF = 0x1b0;
const SIZE = 0x400;

/** 1MB のメモリに TSR のヘッダとバッファを置いた偽ゲスト。 */
function makeGuest() {
  const mem = new Uint8Array(0x100000);
  const setVector = (seg: number): void => {
    mem[0xa4] = 0x10;
    mem[0xa5] = 0;
    mem[0xa6] = seg & 0xff;
    mem[0xa7] = seg >> 8;
  };
  const install = (): void => {
    setVector(SEG);
    mem.set([0x43, 0x4f, 0x4e, 0x48, 1, 0, SIZE & 0xff, SIZE >> 8], HDR);
    mem[HDR + 12] = BUFOFF & 0xff;
    mem[HDR + 13] = BUFOFF >> 8;
  };
  let total = 0;
  const write = (bytes: number[]): void => {
    for (const b of bytes) {
      mem[SEG * 16 + BUFOFF + (total & (SIZE - 1))] = b;
      total = (total + 1) >>> 0;
    }
    new DataView(mem.buffer).setUint32(HDR + 8, total, true);
  };
  const read: ReadMem = (addr, len) => mem.slice(addr, addr + len);
  return { mem, install, write, read, setVector, setTotal: (t: number) => (total = t) };
}

describe('ConhookReader', () => {
  it('ベクタが TSR を指していなければ未常駐', () => {
    const g = makeGuest();
    const r = new ConhookReader();
    expect(r.isResident(g.read)).toBe(false);
    expect(r.poll(g.read).resident).toBe(false);
  });

  it('シグネチャがない(セグメントが別物)なら未常駐', () => {
    const g = makeGuest();
    g.install();
    g.mem[HDR] = 0;
    expect(new ConhookReader().isResident(g.read)).toBe(false);
  });

  it('最初に見つけた時は基準を取るだけで、過去の分は返さない', () => {
    const g = makeGuest();
    g.install();
    g.write([1, 2, 3]);
    const r = new ConhookReader();
    const a = r.poll(g.read);
    expect(a).toMatchObject({ resident: true, attached: true, lost: 0 });
    expect(a.bytes.length).toBe(0);
    g.write([4, 5]);
    expect(Array.from(r.poll(g.read).bytes)).toEqual([4, 5]);
    expect(r.poll(g.read).bytes.length).toBe(0);
  });

  it('バッファ末尾をまたぐ分を連結して返す', () => {
    const g = makeGuest();
    g.install();
    const r = new ConhookReader();
    g.write(new Array(SIZE - 3).fill(9));
    r.poll(g.read);
    g.write([1, 2, 3, 4, 5]);
    const p = r.poll(g.read);
    expect(Array.from(p.bytes)).toEqual([1, 2, 3, 4, 5]);
    expect(p.lost).toBe(0);
  });

  it('一周以上されたら lost を数え、新しいほうのバッファ1周分を返す', () => {
    const g = makeGuest();
    g.install();
    const r = new ConhookReader();
    r.poll(g.read);
    const data = Array.from({ length: SIZE + 100 }, (_, i) => i & 0xff);
    g.write(data);
    const p = r.poll(g.read);
    expect(p.lost).toBe(100);
    expect(p.bytes.length).toBe(SIZE);
    expect(Array.from(p.bytes)).toEqual(data.slice(100));
  });

  it('総数の32bit折り返しをまたいでも差が取れる', () => {
    const g = makeGuest();
    g.install();
    g.setTotal(0xfffffffe);
    g.write([]);
    const r = new ConhookReader();
    r.poll(g.read);
    g.write([7, 8, 9, 10]);
    expect(Array.from(r.poll(g.read).bytes)).toEqual([7, 8, 9, 10]);
  });

  it('TSR が消えたら resident=false、再常駐したら基準を取り直す', () => {
    const g = makeGuest();
    g.install();
    const r = new ConhookReader();
    r.poll(g.read);
    g.setVector(0x0123);
    expect(r.poll(g.read).resident).toBe(false);
    g.install();
    g.write([1]);
    expect(r.poll(g.read)).toMatchObject({ resident: true, attached: true });
  });
});
