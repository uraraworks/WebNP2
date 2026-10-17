// 端末のCPU速度の代理指標を測る wasm マイクロベンチ。
// NP2kai の CPU エミュレーション(インタプリタ)は「命令を読んで分岐し、レジスタ/メモリを更新する」
// 作業の繰り返しなので、同種のループ(br_table 16分岐+メモリ読み書き)を wasm で回して
// 1msあたりの反復数を score とする。JSのJITのブレを避けるため wasm で測る。
// wasm 本体は tools/bench/gen-bench-wasm.mjs が bench-wasm.ts へ生成する。
import { BENCH_WASM_BASE64 } from './bench-wasm.ts';

export interface BenchResult {
  /** 1msあたりの反復数(大きいほど速い) */
  score: number;
  /** ベンチ全体に掛かった時間(ms) */
  ms: number;
}

interface BenchExports {
  init(): void;
  run(iters: number): number;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 中核(純関数寄り)。時計と wasm バイト列を差し替えられるので node でも検証できる。 */
export async function runBenchCore(
  wasmBytes: Uint8Array,
  now: () => number,
  targetMs = 60,
  rounds = 5,
): Promise<BenchResult> {
  const t0 = now();
  const { instance } = await WebAssembly.instantiate(wasmBytes as BufferSource, {});
  const ex = instance.exports as unknown as BenchExports;
  ex.init();
  // ウォームアップ(tier-up待ち)と、targetMs を満たす反復数の見積もり。
  let iters = 100_000;
  let sink = ex.run(iters);
  let t = now();
  sink ^= ex.run(iters);
  const warmMs = Math.max(0.01, now() - t);
  iters = Math.max(10_000, Math.floor((iters * targetMs) / warmMs));
  let best = 0;
  for (let r = 0; r < rounds; r++) {
    t = now();
    sink ^= ex.run(iters);
    const dt = Math.max(0.01, now() - t);
    best = Math.max(best, iters / dt);
  }
  (globalThis as { __webnp2BenchSink?: number }).__webnp2BenchSink = sink;
  return { score: Math.round(best), ms: now() - t0 };
}

/** 反復回数を指定して checksum を返す(検証用)。 */
export async function benchChecksum(wasmBytes: Uint8Array, iters: number): Promise<number> {
  const { instance } = await WebAssembly.instantiate(wasmBytes as BufferSource, {});
  const ex = instance.exports as unknown as BenchExports;
  ex.init();
  return ex.run(iters);
}

export function benchWasmBytes(): Uint8Array {
  return decodeBase64(BENCH_WASM_BASE64);
}

export async function runBench(): Promise<BenchResult> {
  const result = await runBenchCore(benchWasmBytes(), () => performance.now());
  (window as unknown as { __webnp2Bench?: BenchResult }).__webnp2Bench = result;
  console.log(`[WebNP2] bench score=${result.score} (${result.ms.toFixed(0)}ms)`);
  return result;
}
