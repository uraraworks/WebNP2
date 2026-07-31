// ?perf=1 で表示する性能計測オーバーレイ。
// スローダウンの原因切り分け(エミュレーションのCPU飽和 / 周期的な自動保存 /
// 音声供給の詰まり)ができるよう、1秒ごとに主要指標を更新して画面隅に出す。

interface AudioDebugHandle {
  ctx: AudioContext;
  chunkFrames: number;
  getPumpCount: () => number;
  getStats?: () => { underruns: number; lowWaterFrames: number };
}

export function startPerfOverlay(stage: HTMLElement): void {
  const el = document.createElement('div');
  el.className = 'perf-overlay';
  el.textContent = 'perf...';
  stage.append(el);

  // rAFでフレーム数を数える(描画が詰まればここが落ちる)。
  let frames = 0;
  let worstGapMs = 0;
  let lastRaf = performance.now();
  const rafLoop = (): void => {
    const now = performance.now();
    worstGapMs = Math.max(worstGapMs, now - lastRaf);
    lastRaf = now;
    frames++;
    requestAnimationFrame(rafLoop);
  };
  requestAnimationFrame(rafLoop);

  // Long Task (50ms超のメインスレッド占有)の合計。wasmの1スライスが伸びると増える。
  let longTaskMs = 0;
  let longestTaskMs = 0;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskMs += entry.duration;
        longestTaskMs = Math.max(longestTaskMs, entry.duration);
      }
    });
    po.observe({ entryTypes: ['longtask'] });
  } catch {
    // longtask 非対応ブラウザでは省略
  }

  let lastPumps = 0;
  let lastT = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    lastT = now;

    const dbg = (window as unknown as { __webnp2Audio?: AudioDebugHandle }).__webnp2Audio;
    let audioLine = 'audio -';
    if (dbg) {
      const pumps = dbg.getPumpCount();
      const rate = ((pumps - lastPumps) / dt).toFixed(1);
      lastPumps = pumps;
      const expected = (dbg.ctx.sampleRate / dbg.chunkFrames).toFixed(1);
      const stats = dbg.getStats?.() ?? { underruns: 0, lowWaterFrames: 0 };
      audioLine = `audio ${rate}/${expected}ch/s drop:${stats.underruns}`;
    }

    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const lines = [
      `fps ${(frames / dt).toFixed(0)} (gap max ${worstGapMs.toFixed(0)}ms)`,
      `busy ${Math.min(100, longTaskMs / dt / 10).toFixed(0)}% (task max ${longestTaskMs.toFixed(0)}ms)`,
      audioLine,
      mem ? `jsheap ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : '',
    ];
    el.textContent = lines.filter(Boolean).join('\n');
    frames = 0;
    worstGapMs = 0;
    longTaskMs = 0;
    longestTaskMs = 0;
  }, 1000);
}
