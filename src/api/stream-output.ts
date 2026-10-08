// ゲスト側 TSR(guest/conhook/CONHOOK.COM)が捕まえたコンソール出力のバイト列を、
// screen-diff.ts と同じイベント型(line / pending / clear / takeover / gap)へ変換する純粋関数群。
// エミュレータには依存しない(入力はバイト列だけ)。
//
// 入力は INT 29h(DOS の高速コンソール出力)に渡された1バイトずつの列で、
// Shift_JIS・CR/LF・BS・TAB・ESC シーケンスを含む。
//
// 扱いの決め(すべてテストで固定している):
//  - 行は「CR/LF で区切られた論理行」。80桁での自動折り返しはしない(チャットログ向け。
//    折り返しをハードな改行にすると type の長い行が2行に割れて原文とずれる)。
//  - LF(0Ah) で line を確定。CR(0Dh) は桁を0へ戻すだけで、確定はしない。
//    CR のあと LF が来ずに文字が来た場合は上書きとして扱う(進捗表示の "\rNN%" 型)。
//    最後の LF で確定するのは上書き後の内容だけで、途中経過は pending に見える。
//  - BS(08h) は桁を1つ戻すだけ(消さない)。FreeCOM のエコーは "\b \b" なので
//    上書きの規則で消える。
//  - TAB(09h) は次の8の倍数桁へ進み、飛ばした桁は空白になる(画面の見た目と同じ)。
//    原文のタブは空白へ展開された形で出る。
//  - 行末の空白は削る(screen 方式と同じ。getScreenText も右端空白を落とす)。
//  - ESC[2J は clear(行バッファも捨てる)。ESC[K 系と ESC[J(2以外)は行内の消去として扱う。
//    ESC[nD / ESC[nC は桁の移動。ESC[...m(色)、モード設定 h/l などは無視する。
//  - 同じ行の中でのカーソル番地指定 ESC[r;cH は桁の移動として扱う。FreeCOM は入力行の編集を
//    1打鍵ごとに ESC[24;05H 文字 ESC[24;06H ... と「行番号つきの桁指定」で描くため(実測)。
//    「同じ行」の判定: 直前に使った行番号と同じ、または移動先の桁が現在の桁と一致(=移動なし)。
//    行番号は ESC[2J で1、LF で+1(上限は24かそれまでに見た最大値)と推定する。
//  - それ以外のカーソル番地指定(別の行へ、ESC[A/B, ESC[L/M 等)や ESC= は takeover(全画面アプリ)。
//    takeover の間は出力を捨てる。抜ける目安(ヒューリスティック): 番地指定のあとに
//    表示文字が1つ以上あって LF が来たとき。取りこぼしや誤判定はあり得る。
//  - 他の ESC シーケンスは無視する。
//  - gap(): バッファ溢れで途中を失ったとき。現在の行を捨て、次の LF までの断片も捨てる
//    (行の途中から始まる文字列を line にしないため)。

import type { ScreenEvent } from './screen-diff.ts';

const rtrim = (s: string): string => s.replace(/\s+$/, '');

const sjisDec =
  typeof TextDecoder !== 'undefined' ? new TextDecoder('shift_jis') : null;
const pairCache = new Map<number, string>();

function decodePair(lead: number, trail: number): string {
  const key = (lead << 8) | trail;
  let s = pairCache.get(key);
  if (s === undefined) {
    s = sjisDec ? sjisDec.decode(new Uint8Array([lead, trail])) : '?';
    if (s.length !== 1) s = '?'; // 不正な組はデコーダが置換文字+αを返す
    pairCache.set(key, s);
  }
  return s;
}

const isLead = (b: number): boolean =>
  (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc);
const isTrail = (b: number): boolean => b >= 0x40 && b <= 0xfc && b !== 0x7f;

/** この桁以降に下線などで使う内部型: null = 全角文字の右半分(左半分のセルが文字を持つ)。 */
type Cell = string | null;

type EscState = 'none' | 'esc' | 'csi' | 'skip1' | 'skip2';

export class StreamOutputParser {
  private cells: Cell[] = [];
  private col = 0;
  private lead = -1;
  private esc: EscState = 'none';
  private csi = '';
  private takeover = false;
  private sawPrintable = false;
  private skipToLf = false;
  private lastPending: string | null = null;
  private lineRow: number | null = null; // 入力行の推定行番号(1始まり)
  private maxRow = 24;
  private evs: ScreenEvent[] = [];
  private linesThisPush = 0;

  /** 現在の入力行の内容を与える(screen 方式から stream 方式へ切り替える時に使う)。 */
  seed(text: string): void {
    this.cells = [];
    this.col = 0;
    for (const ch of text) {
      const wide = ch.codePointAt(0)! > 0xff && !(ch >= '｡' && ch <= 'ﾟ');
      this.cells[this.col++] = ch;
      if (wide) this.cells[this.col++] = null;
    }
    this.lastPending = this.lineText();
  }

  /** バイト列を流し込み、確定した行・入力中の行などをイベントで返す。 */
  push(bytes: ArrayLike<number>): ScreenEvent[] {
    this.evs = [];
    this.linesThisPush = 0;
    for (let i = 0; i < bytes.length; i++) this.feed(bytes[i] & 0xff);
    this.flushPending();
    const out = this.evs;
    this.evs = [];
    return out;
  }

  /** バイト列の途中を失った。 */
  gap(): ScreenEvent[] {
    this.cells = [];
    this.col = 0;
    this.lead = -1;
    this.esc = 'none';
    this.csi = '';
    this.skipToLf = true;
    this.takeover = false;
    this.lineRow = null;
    this.lastPending = '';
    return [{ type: 'gap' }, { type: 'pending', text: '' }];
  }

  private lineText(): string {
    let s = '';
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      s += c === undefined ? ' ' : (c ?? '');
    }
    return rtrim(s);
  }

  private flushPending(): void {
    if (this.takeover) return;
    const t = this.lineText();
    if (this.linesThisPush > 0 || t !== this.lastPending) {
      this.evs.push({ type: 'pending', text: t });
      this.lastPending = t;
    }
  }

  private put(ch: string, wide: boolean): void {
    this.sawPrintable = true;
    if (this.takeover) return;
    // 既存の全角文字の半分を上書きする場合は相方を空白にする
    if (this.cells[this.col] === null && this.col > 0)
      this.cells[this.col - 1] = ' ';
    if (wide && this.cells[this.col + 1] === null)
      this.cells[this.col + 2] = ' ';
    const cur = this.cells[this.col];
    if (
      typeof cur === 'string' &&
      cur.codePointAt(0)! > 0xff &&
      !(cur >= '｡' && cur <= 'ﾟ')
    ) {
      this.cells[this.col + 1] = ' ';
    }
    this.cells[this.col++] = ch;
    if (wide) this.cells[this.col++] = null;
  }

  private newline(): void {
    if (this.takeover) {
      if (this.sawPrintable) this.takeover = false; // 抜ける目安(ヒューリスティック)
      this.cells = [];
      this.col = 0;
      return;
    }
    this.evs.push({ type: 'line', text: this.lineText() });
    this.linesThisPush++;
    if (this.lineRow !== null) this.lineRow = Math.min(this.lineRow + 1, this.maxRow);
    this.cells = [];
    this.col = 0;
    this.lastPending = null;
  }

  private enterTakeover(): void {
    this.sawPrintable = false;
    if (this.takeover) return;
    this.takeover = true;
    this.cells = [];
    this.col = 0;
    this.evs.push({ type: 'takeover' });
  }

  private doClear(): void {
    if (this.takeover) return; // 全画面アプリの再描画は無視(抜けるのは newline の規則)
    this.cells = [];
    this.col = 0;
    this.lineRow = 1;
    this.lastPending = null;
    this.evs.push({ type: 'clear' });
  }

  private feed(b: number): void {
    if (this.skipToLf) {
      if (b === 0x0a) {
        this.skipToLf = false;
        this.lastPending = null;
      }
      return;
    }
    if (this.esc !== 'none') {
      this.feedEsc(b);
      return;
    }
    if (this.lead >= 0) {
      const lead = this.lead;
      this.lead = -1;
      if (isTrail(b)) {
        this.put(decodePair(lead, b), true);
        return;
      }
      // 不正な2バイト目: 先頭バイトは捨てて b を通常文字として処理する
    }
    if (b === 0x1b) {
      this.esc = 'esc';
    } else if (b === 0x0a) {
      this.newline();
    } else if (b === 0x0d) {
      this.col = 0;
    } else if (b === 0x08) {
      if (this.col > 0) this.col--;
    } else if (b === 0x09) {
      this.col = (this.col + 8) & ~7;
    } else if (b < 0x20) {
      // BEL など: 無視
    } else if (b <= 0x7e) {
      this.put(String.fromCharCode(b), false);
    } else if (b >= 0xa1 && b <= 0xdf) {
      this.put(String.fromCharCode(0xff61 + (b - 0xa1)), false);
    } else if (isLead(b)) {
      this.lead = b;
    }
  }

  private feedEsc(b: number): void {
    switch (this.esc) {
      case 'esc':
        if (b === 0x5b) {
          this.esc = 'csi';
          this.csi = '';
        } else if (b === 0x3d) {
          this.esc = 'skip2'; // ESC = row col
          this.enterTakeover();
        } else if (b === 0x28 || b === 0x29 || b === 0x2a || b === 0x2b) {
          this.esc = 'skip1'; // 文字集合の指定: 1バイト無視
        } else {
          this.esc = 'none';
          if (b === 0x63)
            this.doClear(); // ESC c: リセット
          else if (b === 0x45)
            this.newline(); // ESC E: NEL
          else if (b === 0x44 || b === 0x4d) this.enterTakeover(); // IND / RI
        }
        return;
      case 'skip1':
        this.esc = 'none';
        return;
      case 'skip2':
        this.esc = 'skip1';
        return;
      case 'csi':
        if (b >= 0x40 && b <= 0x7e) {
          this.esc = 'none';
          this.csiFinal(b, this.csi);
          this.csi = '';
        } else if (b >= 0x20 && b <= 0x3f) {
          if (this.csi.length < 32) this.csi += String.fromCharCode(b);
        } else {
          this.esc = 'none'; // 制御文字などが割り込んだら打ち切る
          this.csi = '';
        }
    }
  }

  private csiFinal(f: number, params: string): void {
    const ch = String.fromCharCode(f);
    if (/^[>?<=]/.test(params)) return; // 私的パラメータ付き(ファンクション行表示の切替など): 無視
    const n = parseInt(params.split(';')[0], 10);
    const num = Number.isFinite(n) ? n : NaN;
    const cnt = Number.isFinite(num) && num > 0 ? num : 1;
    switch (ch) {
      case 'J':
        if (num === 2) this.doClear();
        else if (!this.takeover)
          this.cells.length = Math.min(this.cells.length, this.col); // 行内: 末尾消去として扱う
        return;
      case 'K':
        if (this.takeover) return;
        if (Number.isNaN(num) || num === 0)
          this.cells.length = Math.min(this.cells.length, this.col);
        else if (num === 1)
          for (let i = 0; i <= this.col; i++) this.cells[i] = ' ';
        else this.cells = [];
        return;
      case 'D':
        if (!this.takeover) this.col = Math.max(0, this.col - cnt);
        return;
      case 'C':
        if (!this.takeover) this.col += cnt;
        return;
      case 'H':
      case 'f': {
        const ps = params.split(';');
        const r = Math.max(1, parseInt(ps[0], 10) || 1);
        const c = Math.max(1, parseInt(ps[1], 10) || 1);
        if (!this.takeover && (this.lineRow === r || c - 1 === this.col)) {
          this.lineRow = r;
          this.maxRow = Math.max(this.maxRow, r);
          this.col = c - 1;
        } else {
          this.enterTakeover();
        }
        return;
      }
      case 'A':
      case 'B':
      case 'E':
      case 'F':
      case 'G':
      case 'd':
      case 's':
      case 'u':
      case 'L':
      case 'M':
      case 'P':
      case '@':
        this.enterTakeover();
        return;
      default:
        return; // m(色), h/l(モード), n など: 無視
    }
  }
}
