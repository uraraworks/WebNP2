// 仮想CPU風マイクロベンチの wasm バイナリを手組みし、src/core/bench-wasm.ts へ base64 で書き出す。
// 実行: node tools/bench/gen-bench-wasm.mjs   (外部依存なし)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const uleb = (n) => { const o = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n); return o; };
const sleb = (n) => { const o = []; for (;;) { const b = n & 0x7f; n >>= 7; if ((n === 0 && !(b & 0x40)) || (n === -1 && (b & 0x40))) { o.push(b); return o; } o.push(b | 0x80); } };
const vec = (items) => [...uleb(items.length), ...items.flat()];
const str = (s) => [...uleb(s.length), ...[...s].map((c) => c.charCodeAt(0))];
const section = (id, body) => [id, ...uleb(body.length), ...body];

const get = (i) => [0x20, ...uleb(i)];
const set = (i) => [0x21, ...uleb(i)];
const c = (n) => [0x41, ...sleb(n)];
const ld32 = (off = 0) => [0x28, 2, ...uleb(off)];
const ld8 = (off = 0) => [0x2d, 0, ...uleb(off)];
const st32 = (off = 0) => [0x36, 2, ...uleb(off)];
const st8 = (off = 0) => [0x3a, 0, ...uleb(off)];
const ADD = [0x6a], SUB = [0x6b], MUL = [0x6c], AND = [0x71], OR = [0x72], XOR = [0x73];
const SHL = [0x74], SHRU = [0x76], ROTL = [0x77], LTU = [0x49];
const REGS = 65536; // レジスタ配列(i32 x8)
const SCRATCH = 65600; // データ領域

// run(iters) locals: 0 iters,1 i,2 pc,3 op,4 acc,5 s,6 ra
const cases = [
  [...get(4), ...get(6), ...ld32(), ...ADD, ...set(4)],
  [...get(4), ...get(6), ...ld32(), ...XOR, ...set(4)],
  [...get(6), ...get(4), ...st32()],
  [...get(4), ...c(3), ...ROTL, ...set(4)],
  [...get(4), ...get(3), ...ADD, ...set(4)],
  [...get(6), ...get(6), ...ld32(), ...get(4), ...ADD, ...st32()],
  [...get(4), ...get(4), ...c(7), ...SHRU, ...XOR, ...set(4)],
  [...get(4), ...c(33), ...MUL, ...c(1), ...ADD, ...set(4)],
  [...get(2), ...get(3), ...c(4), ...SHRU, ...ADD, ...c(0xffff), ...AND, ...set(2)],
  [...get(4), ...c(1), ...AND, 0x04, 0x40, ...get(2), ...c(3), ...ADD, ...c(0xffff), ...AND, ...set(2), 0x0b],
  [...get(4), ...c(0xfff), ...AND, ...get(4), ...st8(SCRATCH)],
  [...get(4), ...get(4), ...c(0xfff), ...AND, ...ld8(SCRATCH), ...ADD, ...set(4)],
  [...get(5), ...get(4), ...ADD, ...set(5)],
  [...get(4), ...get(6), ...ld32(), ...SUB, ...set(4)],
  [...get(4), ...get(6), ...ld32(), ...AND, ...get(3), ...OR, ...set(4)],
  [...get(6), ...get(6), ...ld32(), ...get(3), ...XOR, ...st32()],
];

const runBody = [];
runBody.push(...c(1), ...set(4)); // acc=1
runBody.push(0x03, 0x40); // loop
runBody.push(...get(2), ...ld8(), ...set(3)); // op = mem8[pc]
runBody.push(...get(2), ...c(1), ...ADD, ...c(0xffff), ...AND, ...set(2)); // pc++
runBody.push(...c(REGS), ...get(3), ...c(4), ...SHRU, ...c(7), ...AND, ...c(2), ...SHL, ...ADD, ...set(6)); // ra
runBody.push(0x02, 0x40); // E
for (let k = 15; k >= 0; k--) runBody.push(0x02, 0x40);
runBody.push(...get(3), ...c(15), ...AND, 0x0e, ...uleb(15), ...[...Array(15).keys()].flatMap((k) => uleb(k)), ...uleb(15));
for (let k = 0; k < 16; k++) {
  runBody.push(0x0b); // end c_k
  runBody.push(...cases[k]);
  if (k < 15) runBody.push(0x0c, ...uleb(15 - k));
}
runBody.push(0x0b); // end E
runBody.push(...get(1), ...c(1), ...ADD, ...set(1)); // i++
runBody.push(...get(1), ...get(0), ...LTU, 0x0d, 0); // br_if loop
runBody.push(0x0b); // end loop
runBody.push(...get(4), ...get(5), ...XOR, ...c(REGS), ...ld32(), ...XOR); // result
runBody.push(0x0b);
const runFn = [...vec([[...uleb(6), 0x7f]]), ...runBody];

// init(): 命令列をLCGで埋め、レジスタを0に。locals: 0 i, 1 x
const initBody = [
  ...c(12345), ...set(1),
  0x03, 0x40,
  ...get(1), ...c(1664525), ...MUL, ...c(1013904223), ...ADD, ...set(1),
  ...get(0), ...get(1), ...c(24), ...SHRU, ...st8(),
  ...get(0), ...c(1), ...ADD, ...set(0),
  ...get(0), ...c(65536), ...LTU, 0x0d, 0,
  0x0b,
  ...c(REGS), ...c(0), ...st32(0),
  0x0b,
];
const initFn = [...vec([[...uleb(2), 0x7f]]), ...initBody];

const bytes = [
  0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
  ...section(1, vec([[0x60, 0, 0], [0x60, 1, 0x7f, 1, 0x7f]])),
  ...section(3, vec([[0], [1]])),
  ...section(5, vec([[0, 2]])),
  ...section(7, vec([[...str('init'), 0, 0], [...str('run'), 0, 1], [...str('mem'), 2, 0]])),
  ...section(10, vec([[...uleb(initFn.length), ...initFn], [...uleb(runFn.length), ...runFn]])),
];
const b64 = Buffer.from(Uint8Array.from(bytes)).toString('base64');
const out = join(dirname(fileURLToPath(import.meta.url)), '../../src/core/bench-wasm.ts');
writeFileSync(out, `// 自動生成: node tools/bench/gen-bench-wasm.mjs (手編集しない)\n// 仮想CPU風ループ(br_table 16分岐)のwasmバイナリ。export: init(), run(iters)->checksum\nexport const BENCH_WASM_BASE64 =\n  '${b64}';\n`);
console.log('wrote', out, bytes.length, 'bytes');
