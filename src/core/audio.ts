// AudioWorkletによる低遅延音声出力。
//
// SDL2(Emscripten)のScriptProcessor経路はメインスレッド駆動の二重バッファで
// 遅延とジャンクが乗るため、コアのミックスを ccall(webnp2_audio_render) で直接
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
} from './module.ts';

let workletCtx: AudioContext | null = null;
let pumpCount = 0;

/** AudioWorklet経路が有効なときだけそのAudioContextを返す(ミュート解除・バナー用)。 */
export function getWorkletAudioContext(): AudioContext | null {
  return workletCtx;
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
    const { chunkFrames, capacityFrames, lowWaterFrames } = options.processorOptions;
    this.chunkFrames = chunkFrames;
    this.capacity = capacityFrames;
    this.lowWater = lowWaterFrames;
    this.ring = new Float32Array(this.capacity * 2);
    this.readPos = 0;
    this.writePos = 0;
    this.level = 0;    // リング内の残フレーム数
    this.pending = 0;  // 要求済みで未着のチャンク数
    this.port.onmessage = (e) => {
      const data = e.data;
      if (!(data instanceof Float32Array)) return;
      this.pending = Math.max(0, this.pending - 1);
      const frames = data.length / 2;
      if (this.level + frames > this.capacity) return; // 溢れは捨てる(生産過剰)
      for (let i = 0; i < frames; i++) {
        const w = ((this.writePos + i) % this.capacity) * 2;
        this.ring[w] = data[i * 2];
        this.ring[w + 1] = data[i * 2 + 1];
      }
      this.writePos = (this.writePos + frames) % this.capacity;
      this.level += frames;
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const l = out[0];
    const r = out[1] || out[0];
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
      }
    }
    // 見込み残量(未着分込み)が下限を切ったら次のチャンクを要求する。
    // メインスレッドがエミュレーション処理中で応答が遅れる分は lowWater が吸収する。
    while (this.level + this.pending * this.chunkFrames < this.lowWater && this.pending < 2) {
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
 * 成功すると coreAudioExternal(1) でSDL側コールバックを無音化し、以後は
 * ワークレットからの要求駆動でミックスを供給する。
 * 対応環境でない・音声未初期化の場合は false を返し、従来のSDL経路のまま動く。
 * @param lowWaterMs リングの下限水位(ms)。未指定はチャンク1個分。小さいほど低遅延だが途切れやすい。
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

  const node = new AudioWorkletNode(ctx, 'webnp2-out', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      chunkFrames,
      capacityFrames: Math.max(chunkFrames * 4, lowWaterFrames + chunkFrames * 2),
      lowWaterFrames,
    },
  });

  const pump = (): void => {
    const buf = new Float32Array(chunkFrames * 2);
    let ok = false;
    try {
      ok = coreAudioRenderInto(buf);
    } catch {
      ok = false;
    }
    if (!ok) return;
    pumpCount++;
    node.port.postMessage(buf, [buf.buffer]);
  };
  node.port.onmessage = (e: MessageEvent) => {
    if (e.data === 'need') pump();
  };
  node.connect(ctx.destination);

  coreAudioExternal(true);
  pump(); // 初期プリフィル1チャンク(以降はワークレットの要求駆動)
  workletCtx = ctx;
  // デバッグ/サポート用の覗き窓(コンソールから供給状況を確認できる)。
  (window as unknown as Record<string, unknown>).__webnp2Audio = {
    ctx,
    chunkFrames,
    lowWaterFrames,
    getPumpCount: () => pumpCount,
  };
  return true;
}
