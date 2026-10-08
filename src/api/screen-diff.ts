// 画面テキストの前後差分から「新しく流れた出力」をイベント列にする純粋関数。
// エミュレータには依存しない(入力は getScreenText() の lines と cursor だけ)。
//
// 考え方(テレタイプモデル):
//   画面は「上から下へ追記され、下端を超えたら全体が上へスクロールする」ものと見なす。
//   前回のカーソル行より上の行は確定済み。今回の画面が k 行スクロールしていたなら
//   next[i] == prev[i + k] が確定済み行すべてで成り立つはず。最小の k を探し、
//   見つかれば差分は「追記された行」と「入力中の行」で説明できる。
//   見つからなければ画面全消去(clear)か、追記型では説明できない変化(takeover)。

/** k>0 のスクロールを認めるのに必要な、一致した文字数(生き残った行+入力行)の下限。 */
const MIN_EVIDENCE_CHARS = 12;

export type CursorPos = { row: number; col: number } | null;

export type ScreenEvent =
  | { type: 'line'; text: string }
  | { type: 'pending'; text: string }
  | { type: 'clear' }
  | { type: 'takeover' }
  | { type: 'gap' };

const rtrim = (s: string): string => s.replace(/\s+$/, '');
// getScreenText は値0x0000のセルを '.' にする。未初期化のTVRAM(起動直後)は '.' 1個だけの行
// になるので、'.' だけの行は空行として扱う。副作用: "....." だけを出力する行も空行になる(残課題)。
const DOTS_ONLY = /^\.+$/;

/**
 * 「実効カーソル行」を返す。
 * 実カーソル行と最後の非空行の下のほう(max)を採る。理由:
 *  - cursor が null(非表示)のとき: 最後の非空行を入力中の行とみなす。
 *    (プロンプト "A:\>" はそこで入力待ちなので、次の出力が来て初めて確定行になる)
 *  - cursor がある場合でも、文字が先に描かれカーソルが後から動く途中の状態で、
 *    カーソルより下に非空行が見えることがある。その行を取りこぼして誤った
 *    takeover にしないため、非空行がカーソルより下ならそちらを採る。
 */
function effectiveCursorRow(lines: string[], cursor: CursorPos): number {
  let lastNonEmpty = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] !== '') {
      lastNonEmpty = i;
      break;
    }
  }
  const cur = cursor ? Math.min(Math.max(cursor.row, 0), lines.length - 1) : -1;
  return Math.max(cur, lastNonEmpty, 0);
}

/** 実機で採取した形(右端空白は getScreenText が既に除去済み)に合わせて正規化する。 */
function normalize(lines: string[]): string[] {
  return lines.map((l) => {
    const t = rtrim(l);
    return DOTS_ONLY.test(t) ? '' : t;
  });
}

/** 初回(prev なし)の画面全体を流す。先頭の空行は捨て、以降の空行は残す。 */
function initialEvents(next: string[], nextCur: number): ScreenEvent[] {
  const evs: ScreenEvent[] = [];
  let first = 0;
  while (first < nextCur && next[first] === '') first++;
  for (let i = first; i < nextCur; i++) evs.push({ type: 'line', text: next[i] });
  if (next[nextCur] !== '' || evs.length > 0) evs.push({ type: 'pending', text: next[nextCur] });
  return evs;
}

export function diffScreens(
  prevLines: string[] | null,
  prevCursor: CursorPos,
  nextLinesRaw: string[],
  nextCursor: CursorPos,
): ScreenEvent[] {
  const next = normalize(nextLinesRaw);
  const R = next.length;
  if (R === 0) return [];
  const nextCur = effectiveCursorRow(next, nextCursor);

  if (prevLines === null) return initialEvents(next, nextCur);

  const prev = normalize(prevLines);
  if (prev.length !== R) {
    // 行数が変わった: 前回が空なら初期化前の画面だったと見て最初から流す。内容があれば画面モード切替。
    return prev.every((l) => l === '') ? initialEvents(next, nextCur) : [{ type: 'takeover' }];
  }
  const p = effectiveCursorRow(prev, prevCursor);

  // 確定済み行(0..p-1)が k 行のスクロールで next に一致するか。
  const confirmedMatch = (k: number): boolean => {
    for (let i = k; i < p; i++) {
      if (next[i - k] !== prev[i]) return false;
    }
    return true;
  };

  const evidence = (kk: number): number => {
    let n = prev[p].length;
    for (let i = kk; i < p; i++) n += prev[i].length;
    return n;
  };

  let k = -1;
  // 1) 厳密: 前回カーソル行が「前方一致で延長された」形。
  //    k>0 のスクロールはカーソルが下端にあるときだけ起きるので nextCur==R-1 を要求する
  //    (これが無いと「cls 後に同じプロンプトが出た」のをスクロールと取り違える)。
  for (let kk = 0; kk <= p; kk++) {
    if (kk > 0 && nextCur !== R - 1) break;
    if (!confirmedMatch(kk)) continue;
    const j = p - kk;
    if (!next[j].startsWith(prev[p])) continue;
    // k>0 は「生き残った行」が一致の根拠。空行や短い行しか残らない大きなスクロールは、
    // 別の場所の空行と偶然一致しやすい(実機で長いファイルを type すると、取りこぼした
    // はずの区間が無言で繋がった)。根拠が薄いときは一致とみなさず gap 側に倒す。
    if (kk > 0 && evidence(kk) < MIN_EVIDENCE_CHARS) continue;
    k = kk;
    break;
  }
  // 2) 緩和: 同じ位置で入力行が縮んだ/書き換わった(バックスペース等)。確定行は不変のみ許す。
  // nextCur==p を要求するのは、新しい行が増えた変化(=出力)をバックスペース扱いで
  // 飲み込まないため(実機で、全画面分の出力が1回のポーリングで流れたとき、
  // 確定行が空だったために無言で「入力行の書き換え」と判定された)。
  if (k < 0 && confirmedMatch(0) && nextCur === p) k = 0;

  if (k >= 0) {
    const j = p - k;
    if (nextCur < j) return [{ type: 'takeover' }];
    const evs: ScreenEvent[] = [];
    for (let i = j; i < nextCur; i++) evs.push({ type: 'line', text: next[i] });
    const pendingChanged = nextCur !== j || next[nextCur] !== prev[p];
    if (evs.length > 0 || pendingChanged) evs.push({ type: 'pending', text: next[nextCur] });
    return evs;
  }

  // 3) 前回カーソル行まで画面外へ出た(取りこぼし)。スクロールならカーソルは下端のはず。
  //    ただし「下端にカーソルがある全面書き換え」も同じ形になり区別できない(残課題)。
  if (nextCur === R - 1) {
    const evs: ScreenEvent[] = [{ type: 'gap' }];
    for (let i = 0; i < nextCur; i++) evs.push({ type: 'line', text: next[i] });
    evs.push({ type: 'pending', text: next[nextCur] });
    return evs;
  }

  // 4) 追記では繋がらない。カーソルより下に文字がある(=カーソル番地指定で描く全画面アプリの形)
  //    なら takeover。そうでなければ「画面を消してから先頭から出力し直した」とみなし、
  //    clear に続けて今の画面を流す(例: カーネルが起動メッセージ前に画面を消して書き直す)。
  if (nextCursor && lastNonEmptyRow(next) > Math.min(nextCursor.row, R - 1)) return [{ type: 'takeover' }];
  const evs: ScreenEvent[] = [{ type: 'clear' }];
  evs.push(...initialEvents(next, nextCur));
  return evs;
}

function lastNonEmptyRow(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i] !== '') return i;
  return -1;
}

/**
 * 最下行が「ファンクションキー表示行」のように固定表示されている画面かを判定する。
 * 実機(FreeDOS(98))では最下行(row 24)に常時 "C1 CU CA S1 SU ..." が出ており、
 * これを入力行と取り違えると実効カーソルが常に最下行になり全てが壊れる。
 * 判定: 最下行が非空で、カーソルが表示されていて最下行より上にある。
 * (カーソルが最下行に来るアプリはこの条件に当たらない。一度立ったら呼び出し側で保持する)
 * 戻り値は無視すべき下端の行数(0 か 1)。
 */
export function detectStatusRows(lines: string[], cursor: CursorPos): number {
  if (lines.length < 2 || !cursor) return 0;
  const last = rtrim(lines[lines.length - 1]);
  return last !== '' && cursor.row < lines.length - 1 ? 1 : 0;
}

/** 下端 statusRows 行を取り除いた画面を返す(カーソルが範囲外なら null 扱い)。 */
export function stripStatusRows(
  lines: string[],
  cursor: CursorPos,
  statusRows: number,
): { lines: string[]; cursor: CursorPos } {
  if (statusRows <= 0) return { lines, cursor };
  const kept = lines.slice(0, lines.length - statusRows);
  return { lines: kept, cursor: cursor && cursor.row < kept.length ? cursor : null };
}

/**
 * ポーリング1回ぶんの画面を受け取りイベントを返す、状態つきの薄いラッパ。
 * - 最下行の固定表示(ファンクションキー行)を検出して除外する
 * - 「ゲストがスクロール中に読んだ」画面(行の一部だけ古い)で誤って gap/takeover を出さないよう、
 *   同じ画面が2回続けて読めてから処理する(最大 maxHold 回まで待ち、それでも落ち着かなければ処理する)
 */
export class ScreenOutputTracker {
  private prev: { lines: string[]; cursor: CursorPos } | null = null;
  private prevKey = '';
  private candidate: { key: string; lines: string[]; cursor: CursorPos } | null = null;
  private held = 0;
  private statusRows = 0;
  private inTakeover = false;

  constructor(private readonly maxHold = 3) {}

  push(lines: string[], cursor: CursorPos): ScreenEvent[] {
    if (lines.length === 0) return []; // コア初期化前は行数0で返ることがある
    const key = JSON.stringify([lines, cursor]);
    if (this.candidate === null) {
      if (this.prev !== null && key === this.prevKey) return []; // 変化なし
      this.candidate = { key, lines, cursor };
      this.held = 0;
      return [];
    }
    if (key === this.candidate.key) {
      // 同じ画面が2回続けて読めた → 確定
      const c = this.candidate;
      this.candidate = null;
      return this.commit(c.key, c.lines, c.cursor);
    }
    // まだ動いている最中。新しい読みを候補にして待つ。待ち上限に達したらそのまま確定する。
    this.held++;
    if (this.held >= this.maxHold) {
      this.candidate = null;
      return this.commit(key, lines, cursor);
    }
    this.candidate = { key, lines, cursor };
    return [];
  }

  private commit(key: string, lines: string[], cursor: CursorPos): ScreenEvent[] {
    this.statusRows = Math.max(this.statusRows, detectStatusRows(lines, cursor));
    const nx = stripStatusRows(lines, cursor, this.statusRows);
    const pv = this.prev ? stripStatusRows(this.prev.lines, this.prev.cursor, this.statusRows) : null;
    let evs = diffScreens(pv?.lines ?? null, pv?.cursor ?? null, nx.lines, nx.cursor);
    // 全画面アプリが動いている間は毎フレーム takeover になるので、最初の1回だけ通知する。
    if (evs.length === 1 && evs[0].type === 'takeover') {
      if (this.inTakeover) evs = [];
      this.inTakeover = true;
    } else if (evs.length > 0) {
      this.inTakeover = false;
    }
    this.prev = { lines, cursor };
    this.prevKey = key;
    return evs;
  }
}
