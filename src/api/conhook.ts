// ゲスト側 TSR(guest/conhook/CONHOOK.COM)が常駐メモリに作るリングバッファを読む側。
// エミュレータには依存しない(メモリ読み出し関数を引数で受ける)。
//
// 見つけ方: 割り込みベクタ 29h(0000:00A4) の指す先のセグメントを取り、そのセグメントの
// オフセット 0103h にあるヘッダを調べる(シグネチャのメモリ全検索はしない。ディスクバッファ上の
// 写しに当たるため)。ベクタが TSR を指していなければ「未常駐」。
//
// ヘッダ(0103h からのオフセット):
//   +0  'CONH'      +4  版(=1)        +6  バッファサイズ(2の冪)
//   +8  書き込み総数(32bit 単調増加)   +12 バッファのセグメント内オフセット
// バッファ位置 = 総数 & (サイズ-1)。

export type ReadMem = (addr: number, len: number) => Uint8Array;

export const CONHOOK_VECTOR_ADDR = 0x29 * 4;
export const CONHOOK_HEADER_OFFSET = 0x103;
const HEADER_LEN = 16;

export interface ConhookPoll {
  /** TSR が見つかったか */
  resident: boolean;
  /** 前回から増えたバイト列(失った分は含まれない) */
  bytes: Uint8Array;
  /** 取りこぼしたバイト数(バッファを一周以上された) */
  lost: number;
  /** この呼び出しで初めて見つけた(基準を取っただけで bytes は空) */
  attached: boolean;
}

export class ConhookReader {
  private base = -1; // ヘッダの物理アドレス
  private last = 0; // 前回読んだ総数

  /** ヘッダの物理アドレスと内容を返す。TSR でなければ null。 */
  private header(
    read: ReadMem,
  ): { base: number; size: number; total: number; bufAddr: number } | null {
    let v: Uint8Array;
    try {
      v = read(CONHOOK_VECTOR_ADDR, 4);
    } catch {
      return null;
    }
    const seg = v[2] | (v[3] << 8);
    const base = seg * 16 + CONHOOK_HEADER_OFFSET;
    let h: Uint8Array;
    try {
      h = read(base, HEADER_LEN);
    } catch {
      return null;
    }
    if (h[0] !== 0x43 || h[1] !== 0x4f || h[2] !== 0x4e || h[3] !== 0x48)
      return null; // 'CONH'
    const ver = h[4] | (h[5] << 8);
    const size = h[6] | (h[7] << 8);
    if (ver !== 1 || size < 256 || (size & (size - 1)) !== 0) return null;
    const total = (h[8] | (h[9] << 8) | (h[10] << 16) | (h[11] << 24)) >>> 0;
    const bufOff = h[12] | (h[13] << 8);
    return { base, size, total, bufAddr: seg * 16 + bufOff };
  }

  /** TSR が常駐しているかだけを調べる(基準は動かさない)。 */
  isResident(read: ReadMem): boolean {
    return this.header(read) !== null;
  }

  poll(read: ReadMem): ConhookPoll {
    const none = new Uint8Array(0);
    const hd = this.header(read);
    if (!hd) {
      this.base = -1;
      return { resident: false, bytes: none, lost: 0, attached: false };
    }
    if (hd.base !== this.base) {
      // 初めて見つけた、または別のTSR(再起動後の再常駐など): 現在位置を基準にする
      this.base = hd.base;
      this.last = hd.total;
      return { resident: true, bytes: none, lost: 0, attached: true };
    }
    const delta = (hd.total - this.last) >>> 0;
    if (delta === 0)
      return { resident: true, bytes: none, lost: 0, attached: false };
    if (delta > 0x80000000) {
      // 総数が戻った(再常駐など): 基準を取り直す
      this.last = hd.total;
      return { resident: true, bytes: none, lost: 0, attached: true };
    }
    let lost = 0;
    let take = delta;
    if (delta > hd.size) {
      lost = delta - hd.size;
      take = hd.size;
    }
    const startTotal = (hd.total - take) >>> 0;
    const pos = startTotal & (hd.size - 1);
    const first = Math.min(take, hd.size - pos);
    const out = new Uint8Array(take);
    out.set(read(hd.bufAddr + pos, first), 0);
    if (first < take) out.set(read(hd.bufAddr, take - first), first);
    this.last = hd.total;
    return { resident: true, bytes: out, lost, attached: false };
  }
}
