// CPUクロック倍率の自動判定。
// 全力実行(NOWAIT)時の1フレーム時間は 倍率 x 端末固有の係数 にほぼ比例する(固定費はほぼ0)。
// 倍率8で全力実行した実測fpsから係数を出し、実時間に追いつく上限に余裕(0.85)を掛けて倍率を決める。
// 測定→リセット→本番の流れで、リセット後はクロックを固定する(使用中には変えない)。
import { coreFrameCount, coreFrameHz, coreReset, coreSetClkMult, coreSetNowait } from './module.ts';
import { setCalibrationMute } from './audio.ts';

const CACHE_KEY = 'webnp2.autoClk.v1';
const PROBE_CLK = 8;
const MIN_CLK = 2;
const MAX_CLK = 20; // 従来の既定(x20)を超えない
const MARGIN = 0.85;
const WINDOW_MS = 500;
const DISCARD_MS = 1000;
const MIN_SETTLE_MS = 2000;
const TIMEOUT_MS = 10000;
const STABLE_RATIO = 0.05;

export interface AutoClkPlan {
  /** 起動時に buildCfg へ渡す倍率(未指定ならコア既定)。 */
  initialClk: number | undefined;
  /** 起動後に測定を行うか。 */
  measure: boolean;
  /** キャッシュ使用時の倍率。 */
  cachedClk: number | null;
}

let currentLabel: string | null = null;

/** perf 表示用。自動判定が関わっているときだけ文字列を返す。 */
export function getAutoClkLabel(): string | null {
  return currentLabel;
}

function readCache(): { clk: number; perClkMs: number; at: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { clk?: unknown; perClkMs?: unknown; at?: unknown };
    if (typeof v.clk !== 'number' || !Number.isFinite(v.clk)) return null;
    const clk = Math.max(MIN_CLK, Math.min(MAX_CLK, Math.floor(v.clk)));
    return { clk, perClkMs: Number(v.perClkMs) || 0, at: Number(v.at) || 0 };
  } catch {
    return null;
  }
}

function writeCache(clk: number, perClkMs: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ clk, perClkMs, at: Date.now() }));
  } catch {
    // 保存できなくても動作は継続する。
  }
}

/** 起動前に呼ぶ。?clk 数値 / ?nowait=1 のときは自動判定しない。 */
export function planAutoClk(clkQuery: string | null, clkNumeric: number | undefined, nowait: boolean): AutoClkPlan {
  if (clkNumeric !== undefined || nowait) {
    return { initialClk: clkNumeric, measure: false, cachedClk: null };
  }
  if (clkQuery !== 'auto') {
    const cache = readCache();
    if (cache) {
      currentLabel = `${cache.clk} (auto)`;
      return { initialClk: cache.clk, measure: false, cachedClk: cache.clk };
    }
  }
  currentLabel = `${PROBE_CLK} (auto)`;
  return { initialClk: PROBE_CLK, measure: true, cachedClk: null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 起動直後のコアに対して測定し、倍率を確定してリセットする。
 * 確定した倍率を返す。測定できなかったときは null(コア既定のまま nowait を戻して終わる)。
 */
export async function runAutoClk(): Promise<number | null> {
  const hz = coreFrameHz();
  if (!hz || coreFrameCount() === null || !coreSetNowait(true)) {
    coreSetNowait(false);
    currentLabel = null;
    return null;
  }
  setCalibrationMute(true);
  let result: number | null = null;
  try {
    const start = performance.now();
    let lastT = start;
    let lastF = coreFrameCount() ?? 0;
    const recent: number[] = []; // 直近3窓のfps
    let maxFps = 0;
    let aborted = false;
    let fps = 0;
    let settled = false;
    let stalled = 0;
    while (performance.now() - start < TIMEOUT_MS) {
      await sleep(WINDOW_MS);
      // 非表示だとrAF/タイマが間引かれ測定が歪むので中止する(測定失敗と同じ扱い)。
      if (document.visibilityState !== 'visible') {
        aborted = true;
        break;
      }
      const now = performance.now();
      const f = coreFrameCount();
      if (f === null) break;
      const df = f - lastF;
      const dt = now - lastT;
      lastF = f;
      lastT = now;
      if (now - start <= DISCARD_MS) continue; // 最初の1秒は捨てる
      if (df <= 0) {
        if (++stalled >= 2) break; // ポーズ等で進まない
        continue;
      }
      stalled = 0;
      fps = (df * 1000) / dt;
      maxFps = Math.max(maxFps, fps);
      // 2026-10-17実測: 隣り合う2窓の比較では1回ぶれた値で誤って安定扱いになり得るため、
      // 直近3窓の最大・最小の差が最大値の5%以内になるまで待つ。
      recent.push(fps);
      if (recent.length > 3) recent.shift();
      if (recent.length === 3 && now - start >= MIN_SETTLE_MS) {
        const hi = Math.max(...recent);
        const lo = Math.min(...recent);
        if ((hi - lo) / hi <= STABLE_RATIO) {
          settled = true;
          break;
        }
      }
    }
    const useFps = settled ? recent.reduce((a, b) => a + b, 0) / recent.length : maxFps;
    if (!aborted && useFps > 0) {
      const perClkMs = 1000 / useFps / PROBE_CLK;
      const clk = Math.max(MIN_CLK, Math.min(MAX_CLK, Math.floor(((1000 / hz) * MARGIN) / perClkMs)));
      result = clk;
      coreSetNowait(false);
      coreSetClkMult(clk);
      coreReset();
      // 打ち切り(未安定)の値はぶれている可能性があるので今回のみ適用し、キャッシュしない(次回起動で再測定)。
      if (settled) {
        writeCache(clk, perClkMs);
        console.log(`[WebNP2] auto clk: x${clk} (perClk ${perClkMs.toFixed(2)}ms, cached)`);
      } else {
        console.log(`[WebNP2] auto clk: x${clk} (not settled, not cached)`);
      }
      currentLabel = `${clk} (auto)`;
    }
  } finally {
    coreSetNowait(false);
    setCalibrationMute(false);
  }
  if (result === null) {
    // 測定できなかった: 従来の既定(x20)へ戻して再起動する。
    if (coreSetClkMult(MAX_CLK)) coreReset();
    currentLabel = null;
  }
  return result;
}
