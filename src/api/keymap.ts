// PC-98キーボードのスキャンコード表。
// webnp2_key() へ渡すコードは PC-98本体キーボードのメイクコード(0x00始まり)であり、
// PC/AT(USB)配列やJIS配列とは並びが異なる点に注意。

/** 名前付きキー(修飾キー・特殊キー・ファンクションキー等)のスキャンコード表。 */
export const NAMED_KEYS: Record<string, number> = {
  ESC: 0x00,
  BS: 0x0e,
  TAB: 0x0f,
  ENTER: 0x1c,
  CR: 0x1c,
  RETURN: 0x1c,
  SPACE: 0x34,
  UP: 0x3a,
  LEFT: 0x3b,
  RIGHT: 0x3c,
  DOWN: 0x3d,
  INS: 0x38,
  DEL: 0x39,
  ROLLUP: 0x36,
  ROLLDOWN: 0x37,
  HOME: 0x3e,
  CLR: 0x3e,
  HELP: 0x3f,
  XFER: 0x35,
  NFER: 0x51,
  STOP: 0x60,
  COPY: 0x61,
  F1: 0x62,
  F2: 0x63,
  F3: 0x64,
  F4: 0x65,
  F5: 0x66,
  F6: 0x67,
  F7: 0x68,
  F8: 0x69,
  F9: 0x6a,
  F10: 0x6b,
  SHIFT: 0x70,
  CAPS: 0x71,
  KANA: 0x72,
  GRPH: 0x73,
  CTRL: 0x74,
};

// ASCII一文字 → PC-98スキャンコードの単純マップ(shiftなしのもの)。
const PLAIN_MAP: Record<string, number> = {
  '1': 0x01,
  '2': 0x02,
  '3': 0x03,
  '4': 0x04,
  '5': 0x05,
  '6': 0x06,
  '7': 0x07,
  '8': 0x08,
  '9': 0x09,
  '0': 0x0a,
  '-': 0x0b,
  '^': 0x0c,
  '\\': 0x0d,
  q: 0x10,
  w: 0x11,
  e: 0x12,
  r: 0x13,
  t: 0x14,
  y: 0x15,
  u: 0x16,
  i: 0x17,
  o: 0x18,
  p: 0x19,
  '@': 0x1a,
  '[': 0x1b,
  a: 0x1d,
  s: 0x1e,
  d: 0x1f,
  f: 0x20,
  g: 0x21,
  h: 0x22,
  j: 0x23,
  k: 0x24,
  l: 0x25,
  ';': 0x26,
  ':': 0x27,
  ']': 0x28,
  z: 0x29,
  x: 0x2a,
  c: 0x2b,
  v: 0x2c,
  b: 0x2d,
  n: 0x2e,
  m: 0x2f,
  ',': 0x30,
  '.': 0x31,
  '/': 0x32,
  ' ': 0x34,
};

// shiftを伴うASCII一文字 → PC-98スキャンコード(shift付き)のマップ。
const SHIFT_MAP: Record<string, number> = {
  '!': 0x01,
  '"': 0x02,
  '#': 0x03,
  $: 0x04,
  '%': 0x05,
  '&': 0x06,
  "'": 0x07,
  '(': 0x08,
  ')': 0x09,
  '=': 0x0b,
  '`': 0x0c,
  '|': 0x0d,
  '~': 0x1a,
  '{': 0x1b,
  '+': 0x26,
  '*': 0x27,
  '}': 0x28,
  '<': 0x30,
  '>': 0x31,
  '?': 0x32,
  _: 0x33,
};

/**
 * ASCII文字からPC-98配列での打鍵情報(スキャンコード + shift要否)を返す。
 * マッチしなければ undefined。
 */
export function charToKey(ch: string): { code: number; shift: boolean } | undefined {
  if (ch === '\n' || ch === '\r') {
    return { code: NAMED_KEYS.ENTER, shift: false };
  }
  if (ch.length === 1 && ch >= 'A' && ch <= 'Z') {
    const lower = ch.toLowerCase();
    const code = PLAIN_MAP[lower];
    if (code !== undefined) {
      return { code, shift: true };
    }
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(PLAIN_MAP, ch)) {
    return { code: PLAIN_MAP[ch], shift: false };
  }
  if (Object.prototype.hasOwnProperty.call(SHIFT_MAP, ch)) {
    return { code: SHIFT_MAP[ch], shift: true };
  }
  return undefined;
}
