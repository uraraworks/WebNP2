// AudioWorkletによる低遅延音声出力。
//
// SDL2(Emscripten)のScriptProcessor経路はメインスレッド駆動の二重バッファで
// 遅延とジャンクが乗るため、コアのミックスを webnp2_audio_render で直接
// 吸い出し、AudioWorklet(音声スレッド)のリングバッファへ流し込む。
// ワークレット→メインスレッドの postMessage で「次のチャンクが欲しい」を要求し、
// メインスレッド側がミックスを transferable で返す pull 型。
// SharedArrayBuffer を使わないため、COOP/COEP ヘッダの無い GitHub Pages でも動く。
//
// コアの sound_pcmlock/unlock は1サイクルで固定量(sndstream.samples)を消費する
// 設計のため、チャンクサイズは必ず coreAudioChunkFrames() に従う。

import {
  coreAudioChunkFrames,
  coreAudioExternal,
  coreAudioRate,
  coreAudioRenderInto,
  resolveAudioContext,
} from './module.ts';

let workletCtx: AudioContext | null = null;
let workletGain: GainNode | null = null;
let pumpCount = 0;

// ユーザー操作によるミュート状態。startWorkletAudio()呼び出し前にsetAudioMuted()が
// 呼ばれることもある(起動時に保存済み設定を復元する場合)ため、モジュールスコープの
// 変数として保持し、GainNode生成時(startWorkletAudio)にこの値を反映する。
let muted = false;
// CPU速度の自動測定中だけ立てる内部用ミュート。ユーザーのミュートとORで効く。
let calibrationMuted = false;

function applyWorkletGain(): void {
  if (workletGain) {
    workletGain.gain.value = muted || calibrationMuted ? 0 : 1;
  }
}

/** 測定中の内部ミュート(ワークレット経路のゲインのみ。SDLフォールバックでは何もしない)。 */
export function setCalibrationMute(on: boolean): void {
  calibrationMuted = on;
  applyWorkletGain();
}

/** AudioWorklet経路が有効なときだけそのAudioContextを返す(ミュート解除・バナー用)。 */
export function getWorkletAudioContext(): AudioContext | null {
  return workletCtx;
}

/**
 * ユーザー操作によるミュートON/OFF。
 *
 * AudioContext.suspend()は使わない: この経路はワークレット→メインスレッドの
 * postMessageで駆動するpull型(WORKLET_CODEのneed要求→pump())で、コアのミックスは
 * pump()がcoreAudioRenderInto()で毎回吸い出している。suspend()するとワークレットの
 * processが呼ばれなくなり、pump()自体が止まってコア側のサウンドバッファ供給(消費)が
 * 止まる。これはコアのタイミングにも波及しうるため、供給は止めずGainNodeで
 * 出力音量だけ0/1に切り替える。
 *
 * AudioWorkletが使えずSDL2フォールバック(resolveAudioContext())になっている場合は
 * push型なので、そちらは素直にsuspend()/resume()で代替する。フォールバック側の
 * AudioContextはコア起動前などまだ取得できないこともあるため、失敗しても例外は
 * 投げない(黙って諦める)。
 */
export function setAudioMuted(nextMuted: boolean): void {
  muted = nextMuted;
  applyWorkletGain();
  if (workletCtx) return;
  const fallbackCtx = resolveAudioContext();
  if (!fallbackCtx) return;
  try {
    if (muted) {
      void fallbackCtx.suspend();
    } else {
      void fallbackCtx.resume();
    }
  } catch {
    // SDL2フォールバック側が無い/操作できない環境では何もしない。
  }
}

/** 現在のミュート状態。 */
export function isAudioMuted(): boolean {
  return muted;
}

/** デバッグ用: これまでに供給したチャンク数。実時間なら rate/chunkFrames [回/秒] で増える。 */
export function getWorkletAudioPumpCount(): number {
  return pumpCount;
}

// AudioWorkletProcessor は独立したスコープで評価されるため、コードを文字列で持ち
// Blob URL 経由で addModule する(ビルド設定に依存せず自己完結させるため)。
const WORKLET_CODE = `
class WebNP2Out extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { chunkFrames, capacityFrames, lowWaterFrames, maxLowWaterFrames, legacy } = options.processorOptions;
    this.legacy = legacy;
    this.chunkFrames = chunkFrames;
    this.capacity = capacityFrames;
    this.lowWater = lowWaterFrames;
    this.maxLowWater = maxLowWaterFrames;
    this.ring = new Float32Array(this.capacity * 2);
    this.readPos = 0;
    this.writePos = 0;
    this.level = 0;    // リング内の残フレーム数
    this.pending = 0;  // 要求済みで未着のチャンク数
    this.started = false;        // 最初のチャンク到着後にアンダーラン計測を始める
    this.underruns = 0;
    this.lastUnderrunAt = 0;     // currentFrame基準。連続した枯渇を1回に数えるデバウンス
    this.port.onmessage = (e) => {
      const data = e.data;
      if (data && data.type === 'raiseLowWater') {
        // メインスレッド側の供給不足検知からの引き上げ要求(アンダーラン未検出でも効かせる)。
        const next = Math.min(this.maxLowWater, Math.max(this.lowWater, data.frames | 0));
        if (next !== this.lowWater) {
          this.lowWater = next;
          this.port.postMessage({ type: 'stats', underruns: this.underruns, lowWaterFrames: this.lowWater, reason: 'supply' });
        }
        return;
      }
      if (!(data instanceof Float32Array)) return;
      this.pending = Math.max(0, this.pending - 1);
      const frames = data.length / 2;
      if (this.level + frames > this.capacity) {
        if (!this.legacy) this.port.postMessage(data, [data.buffer]);
        return; // 溢れは捨てる(生産過剰)
      }
      for (let i = 0; i < frames; i++) {
        const w = ((this.writePos + i) % this.capacity) * 2;
        this.ring[w] = data[i * 2];
        this.ring[w + 1] = data[i * 2 + 1];
      }
      this.writePos = (this.writePos + frames) % this.capacity;
      this.level += frames;
      this.started = true;
      if (!this.legacy) this.port.postMessage(data, [data.buffer]);
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const l = out[0];
    const r = out[1] || out[0];
    let starved = false;
    for (let i = 0; i < l.length; i++) {
      if (this.level > 0) {
        const p = this.readPos * 2;
        l[i] = this.ring[p];
        r[i] = this.ring[p + 1];
        this.readPos = (this.readPos + 1) % this.capacity;
        this.level--;
      } else {
        l[i] = 0;
        r[i] = 0;
        starved = true;
      }
    }
    // アンダーラン(音の途切れ)を検出したら下限水位を自動で半チャンクずつ引き上げ、
    // そのマシンのメインスレッド応答遅れに合わせて安定側へ寄せる(上限あり)。
    // 供給が常時足りない端末ではここが反応しないことがあるため、メインスレッド側の
    // 供給レート監視からも raiseLowWater で引き上げる。
    // 250ms以内の連続枯渇は同じ1回として扱う。
    if (starved && this.started) {
      if (currentFrame - this.lastUnderrunAt > sampleRate / 4) {
        this.underruns++;
        if (this.lowWater < this.maxLowWater) {
          this.lowWater = Math.min(this.maxLowWater, this.lowWater + (this.chunkFrames >> 1));
        }
        this.port.postMessage({ type: 'stats', underruns: this.underruns, lowWaterFrames: this.lowWater });
      }
      this.lastUnderrunAt = currentFrame;
    }
    // 見込み残量(未着分込み)が下限を切ったら次のチャンクを要求する。
    // メインスレッドがエミュレーション処理中で応答が遅れる分は lowWater が吸収する。
    while (this.level + this.pending * this.chunkFrames < this.lowWater && this.pending < 3) {
      this.port.postMessage('need');
      this.pending++;
    }
    return true;
  }
}
registerProcessor('webnp2-out', WebNP2Out);
`;

/**
 * AudioWorklet音声出力を開始する。コア起動後(音声初期化後)に一度だけ呼ぶこと。
 * 成功すると coreAudioExternal(1) でSDL側の出力を止め、以後は
 * ワークレットからの要求駆動でミックスを供給する。
 * 対応環境でない・音声未初期化の場合は false を返し、従来のSDL経路のまま動く。
 * @param lowWaterMs リングの下限水位の初期値(ms)。未指定はチャンク1個分。小さいほど低遅延だが
 *   途切れやすい。アンダーランの検出、または1秒ごとの供給レート監視(期待値の90%未満)で
 *   上限(初期値・チャンク3個分・200msの最大)まで自動で引き上げて安定側へ寄せる。
 */
export async function startWorkletAudio(lowWaterMs?: number): Promise<boolean> {
  if (workletCtx) return true;
  if (typeof AudioWorkletNode === 'undefined') return false;

  const rate = coreAudioRate();
  const chunkFrames = coreAudioChunkFrames();
  if (rate <= 0 || chunkFrames <= 0) return false;

  // コアと同じレートで専用コンテキストを作る(出力デバイスへのリサンプルはブラウザ任せ)。
  // レート指定非対応・生成失敗時はSDL経路へフォールバックする。
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: rate });
  } catch {
    return false;
  }
  const url = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'text/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
  } catch {
    void ctx.close();
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }

  const lowWaterFrames =
    lowWaterMs !== undefined && Number.isFinite(lowWaterMs) && lowWaterMs > 0
      ? Math.max(128, Math.round((lowWaterMs / 1000) * rate))
      : chunkFrames;
  // 自動引き上げ上限(初期値・チャンク3個分・200msの最大)。低スペック端末では
  // 70ms程度では足りず、200msまで引き上げられる必要があった。
  const maxLowWaterFrames = Math.max(lowWaterFrames, chunkFrames * 3, Math.round(0.2 * rate));

  const legacy = new URLSearchParams(location.search).get('audiolegacy') === '1';
  const pool: Float32Array[] = [];
  const node = new AudioWorkletNode(ctx, 'webnp2-out', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      chunkFrames,
      legacy,
      capacityFrames: maxLowWaterFrames + chunkFrames * 3,
      lowWaterFrames,
      maxLowWaterFrames,
    },
  });

  const stats = { underruns: 0, lowWaterFrames };
  const pump = (): void => {
    const buf = pool.pop() ?? new Float32Array(chunkFrames * 2);
    let ok = false;
    try {
      ok = coreAudioRenderInto(buf, legacy);
    } catch {
      ok = false;
    }
    if (!ok) {
      if (!legacy) pool.push(buf);
      return;
    }
    pumpCount++;
    node.port.postMessage(buf, [buf.buffer]);
  };
  node.port.onmessage = (e: MessageEvent) => {
    if (!legacy && e.data instanceof Float32Array && e.data.length === chunkFrames * 2) {
      pool.push(e.data);
      return;
    }
    if (e.data === 'need') {
      pump();
      return;
    }
    const msg = e.data as { type?: string; underruns?: number; lowWaterFrames?: number; reason?: string };
    if (msg && msg.type === 'stats') {
      stats.underruns = msg.underruns ?? stats.underruns;
      stats.lowWaterFrames = msg.lowWaterFrames ?? stats.lowWaterFrames;
      // 供給不足由来の引き上げはmonitorSupply側でログを出すのでここでは出さない。
      if (msg.reason !== 'supply') {
        console.log(
          `[WebNP2] audio underrun #${stats.underruns} — low-water raised to ` +
            `${((stats.lowWaterFrames / rate) * 1000).toFixed(0)}ms`,
        );
      }
    }
  };

  // 供給不足の検知: アンダーラン検知は「供給が遅い」だけでは反応しないことがある
  // (低スペック端末で供給が必要数の55%でもdrop:0だった)。1秒ごとに実供給レートを
  // 期待値(rate/chunkFrames)と比べ、90%未満なら下限水位を1チャンク分引き上げる。
  // 非表示・suspend中・タイマー遅延の区間と起動直後の2回は誤判定になるので捨てる。
  let supplyLastPump = pumpCount;
  let supplyLastT = performance.now();
  let supplySkip = 2;
  const expectedPerSec = rate / chunkFrames;
  setInterval(() => {
    const now = performance.now();
    const dt = (now - supplyLastT) / 1000;
    const pumps = pumpCount - supplyLastPump;
    supplyLastT = now;
    supplyLastPump = pumpCount;
    if (supplySkip > 0) {
      supplySkip--;
      return;
    }
    if (ctx.state !== 'running' || document.visibilityState !== 'visible') return;
    if (dt < 0.5 || dt > 2) return;
    if (stats.lowWaterFrames >= maxLowWaterFrames) return;
    const supplyRate = pumps / dt;
    if (supplyRate >= expectedPerSec * 0.9) return;
    const next = Math.min(maxLowWaterFrames, stats.lowWaterFrames + chunkFrames);
    node.port.postMessage({ type: 'raiseLowWater', frames: next });
    console.log(
      `[WebNP2] audio supply shortfall (${supplyRate.toFixed(1)}/${expectedPerSec.toFixed(1)}ch/s) — ` +
        `low-water raised to ${((next / rate) * 1000).toFixed(0)}ms`,
    );
  }, 1000);
  // ミュートON/OFFはsuspend/resumeでpump()を止めず、GainNodeの音量だけで切り替える
  // (setAudioMuted()参照)。生成時点で既に設定されているミュート状態を反映する。
  const gain = ctx.createGain();
  gain.gain.value = muted || calibrationMuted ? 0 : 1;
  node.connect(gain);
  gain.connect(ctx.destination);
  workletGain = gain;

  coreAudioExternal(true, !legacy);
  pump(); // 初期プリフィル1チャンク(以降はワークレットの要求駆動)
  workletCtx = ctx;
  // デバッグ/サポート用の覗き窓(コンソールから供給状況を確認できる)。
  (window as unknown as Record<string, unknown>).__webnp2Audio = {
    ctx,
    // ミュート後段の出力ノード。ここへAnalyserNodeを繋げば「実際に destination へ
    // 送られている音」を測れる(ミュートが効いているかの検証にも使う)。
    gain,
    chunkFrames,
    getPumpCount: () => pumpCount,
    getStats: () => ({ ...stats }),
  };
  return true;
}
