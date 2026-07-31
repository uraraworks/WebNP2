// Emscripten Module のライフサイクル管理層。
// NP2kai-wasm (emnp21kai_sdl2.js) は非 MODULARIZE 形式のビルドなので、
// グローバル `window.Module` を先に定義してから <script> を動的挿入して起動する。

export interface DiskFile {
  name: string;
  bytes: Uint8Array;
}

export interface BootConfig {
  hdd?: DiskFile;
  fds: DiskFile[];
  latencyMs?: number;
  /** 拡張メモリ容量(MB)。本体メモリ640KBに加算される。省略時は1MB(DOS標準構成)。 */
  extMemMB?: number;
  /** CPUクロック倍率。1〜32の整数にクランプして clk_mult= として出力する。省略時はコア既定値。 */
  clkMult?: number;
  /** ユーザー登録済みのROM/素材ファイル。preRunでMEMFSのルート直下(/名前)へ注入する。 */
  roms?: DiskFile[];
}

// Emscripten FS の最小限の型 (このプロジェクトで使う分のみ)。
export interface EmscriptenFS {
  writeFile(path: string, data: Uint8Array | string): void;
  readFile(path: string, opts?: { encoding?: 'binary' | 'utf8' }): Uint8Array;
  mkdir(path: string): void;
  createPreloadedFile(
    parent: string,
    name: string,
    url: string,
    canRead: boolean,
    canWrite: boolean,
  ): void;
  analyzePath(path: string): { exists: boolean };
}

export type CCallType = 'number' | 'string' | 'array' | 'boolean' | null;
export type CCallFn = (
  ident: string,
  returnType: CCallType,
  argTypes: CCallType[],
  args: unknown[],
) => unknown;

interface EmscriptenSDL2 {
  audioContext?: AudioContext;
}

interface EmscriptenModule {
  canvas?: HTMLCanvasElement;
  preRun?: Array<() => void>;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  locateFile?: (path: string) => string;
  arguments?: string[];
  onRuntimeInitialized?: () => void;
  FS?: EmscriptenFS;
  ccall?: CCallFn;
  onAbort?: (what: unknown) => void;
  SDL2?: EmscriptenSDL2;
  HEAPU8?: Uint8Array;
}

declare global {
  interface Window {
    Module?: EmscriptenModule;
    FS?: EmscriptenFS;
    ccall?: CCallFn;
    SDL2?: EmscriptenSDL2;
    HEAPU8?: Uint8Array;
  }
}

// 非MODULARIZEビルドでは FS/ccall は Module ではなくグローバル変数として定義される
// (クラシックscriptのトップレベル var はグローバルになる)。両方を試す。
function resolveFS(): EmscriptenFS | undefined {
  return window.Module?.FS ?? window.FS;
}

function resolveCcall(): CCallFn | undefined {
  return window.Module?.ccall ?? window.ccall;
}

/** HEAPU8 (wasmメモリの Uint8Array ビュー) を取得する。Module/グローバル両対応。 */
function resolveHeapU8(): Uint8Array | undefined {
  return window.Module?.HEAPU8 ?? window.HEAPU8;
}

/**
 * SDL2ポートが保持するAudioContextを取得する。
 * emnp21kai_sdl2.js内では `Module["SDL2"] = Module["SDL2"] || {}` として遅延生成され、
 * `var SDL2 = Module["SDL2"]` は関数スコープのローカル変数なのでグローバル `window.SDL2` には
 * 出てこない。念のため window.SDL2 もフォールバックとして見ておく。
 */
export function resolveAudioContext(): AudioContext | undefined {
  return window.Module?.SDL2?.audioContext ?? window.SDL2?.audioContext;
}

function requireCcall(): CCallFn {
  const ccall = resolveCcall();
  if (!ccall) {
    throw new Error('ccall is not available (core not booted yet?)');
  }
  return ccall;
}

const CORE_BASE = './core/';
const CORE_SCRIPT_ID = 'webnp2-core-script';

let booted = false;

/** 現在起動中かどうか。二重boot防止に使う。 */
export function isBooted(): boolean {
  return booted;
}

function buildCfg(config: BootConfig): string {
  // ユーザーが font.rom を登録済みならそちらを優先する（同梱の font.bmp はフォールバック）。
  const hasFontRom = config.roms?.some((r) => r.name.toLowerCase() === 'font.rom') ?? false;
  const lines = ['[NekoProject21kai]', hasFontRom ? 'fontfile=/font.rom' : 'fontfile=/font.bmp'];
  if (config.hdd) {
    lines.push(`HDD1FILE=/disk/${config.hdd.name}`);
  }
  lines.push(`Latencys=${config.latencyMs ?? 40}`);
  // 実機のPC-98はキーボード側がオートリピートを送るため、押しっぱなしで連続入力される。
  // NP2kaiのリピートエミュレーション(keystat.c)は既定OFFなので明示的に有効化する。
  lines.push('keyrepeat_enable=true');
  // delay/interval の構造体既定値は 0 のため未指定だと短押しでも連打になる。実機相当の値を明示する。
  lines.push('keyrepeat_delay=500');
  lines.push('keyrepeat_interval=50');
  // ExMemory = 拡張メモリ(MB)。DOS用途では1MBで十分なので既定は小さく保つ。
  const extMem = Math.max(0, Math.min(230, Math.floor(config.extMemMB ?? 1)));
  lines.push(`ExMemory=${extMem}`);
  if (config.clkMult !== undefined) {
    const clkMult = Math.max(1, Math.min(32, Math.floor(config.clkMult)));
    lines.push(`clk_mult=${clkMult}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * NP2kai-wasm コアを起動する。
 * 二重起動はエラーにする（ページ全体をリロードして呼び直すこと）。
 */
export function boot(config: BootConfig, canvas: HTMLCanvasElement): Promise<EmscriptenFS> {
  if (booted) {
    return Promise.reject(new Error('core is already booted (reload the page to reboot)'));
  }
  booted = true;

  return new Promise<EmscriptenFS>((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown): void => {
      if (settled) return;
      settled = true;
      booted = false;
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    window.onerror = (message, source, lineno, colno, error) => {
      console.error('[WebNP2 core] window.onerror', message, source, lineno, colno, error);
      fail(error ?? message);
      return false;
    };

    const module: EmscriptenModule = {
      canvas,
      preRun: [
        function preRunInjectDisks(): void {
          const FS = resolveFS();
          if (!FS) {
            fail(new Error('FS is not available in preRun'));
            return;
          }
          try {
            if (!FS.analyzePath('/disk').exists) {
              FS.mkdir('/disk');
            }
            if (config.hdd) {
              FS.writeFile(`/disk/${config.hdd.name}`, config.hdd.bytes);
            }
            for (const fd of config.fds) {
              FS.writeFile(`/disk/${fd.name}`, fd.bytes);
            }
            for (const rom of config.roms ?? []) {
              FS.writeFile(`/${rom.name}`, rom.bytes);
            }
            FS.createPreloadedFile('/', 'font.bmp', `${CORE_BASE}font.bmp`, true, false);
            FS.writeFile('/np21kai.cfg', buildCfg(config));
          } catch (err) {
            fail(err);
          }
        },
      ],
      print: (text: string) => console.log('[WebNP2 core stdout]', text),
      printErr: (text: string) => console.log('[WebNP2 core stderr]', text),
      locateFile: (path: string) => CORE_BASE + path,
      arguments: config.fds.map((fd) => `/disk/${fd.name}`),
      onRuntimeInitialized: () => {
        if (settled) return;
        settled = true;
        const FS = resolveFS();
        if (!FS) {
          fail(new Error('FS is not available after runtime init'));
          return;
        }
        resolve(FS);
      },
      onAbort: (what: unknown) => {
        console.error('[WebNP2 core] aborted', what);
        fail(new Error(`core aborted: ${String(what)}`));
      },
    };

    // SDLが作るWebGLコンテキストは既定で preserveDrawingBuffer=false のため、
    // 描画後に canvas.toBlob すると真っ黒になる。スクリーンショット機能のために
    // コンテキスト生成をラップして強制的に有効化する。
    const origGetContext = canvas.getContext.bind(canvas) as (
      type: string,
      attrs?: Record<string, unknown>,
    ) => RenderingContext | null;
    (canvas as { getContext: typeof origGetContext }).getContext = (type, attrs) => {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return origGetContext(type, { ...(attrs ?? {}), preserveDrawingBuffer: true });
      }
      return origGetContext(type, attrs);
    };

    window.Module = module;

    // 既存のコアスクリプトが残っていたら除去してから挿入する。
    const existing = document.getElementById(CORE_SCRIPT_ID);
    if (existing) {
      existing.remove();
    }

    const script = document.createElement('script');
    script.id = CORE_SCRIPT_ID;
    script.src = `${CORE_BASE}emnp21kai_sdl2.js?v=${Date.now()}`;
    script.onerror = () => fail(new Error(`failed to load ${script.src}`));
    document.body.appendChild(script);
  });
}

/** MEMFS 上のディスクイメージを読み出す。 */
export function readDiskFile(fs: EmscriptenFS, name: string): Uint8Array {
  return fs.readFile(`/disk/${name}`, { encoding: 'binary' });
}

/** マシンリセット (pccore_cfgupdate + pccore_reset)。 */
export function coreReset(): void {
  requireCcall()('webnp2_reset', null, [], []);
}

/** バスマウスのキャプチャをトグルする。戻り値は新しい状態(1=キャプチャ中)。
 *  キャプチャ開始はブラウザのpointer lock要求になるため、ユーザー操作
 *  (クリックハンドラ等)の中から同期的に呼ぶこと。 */
export function coreMouseToggle(): number {
  return requireCcall()('webnp2_mouse_toggle', 'number', [], []) as number;
}

/** 現在のマウスキャプチャ状態(1=キャプチャ中)。 */
export function coreMouseCaptured(): number {
  return requireCcall()('webnp2_mouse_captured', 'number', [], []) as number;
}

/** 実行中のFDドライブへイメージを挿抜する。path='' で排出。drive は 0..3。 */
export function coreSetFdd(drive: number, path: string): void {
  requireCcall()('webnp2_set_fdd', null, ['number', 'string'], [drive, path]);
}

/** MEMFS 上の path へステートセーブする。戻り値は statsave.c の仕様に準じる。 */
export function coreStatSave(path: string): number {
  return requireCcall()('webnp2_statsave', 'number', ['string'], [path]) as number;
}

/** MEMFS 上の path からステートロードする。戻り値は statsave.c の仕様に準じる。 */
export function coreStatLoad(path: string): number {
  return requireCcall()('webnp2_statload', 'number', ['string'], [path]) as number;
}

/** バスマウスの相対移動を累積させる。 */
export function coreMouseMove(dx: number, dy: number): void {
  requireCcall()('webnp2_mouse_move', null, ['number', 'number'], [dx, dy]);
}

/** バスマウスの未消費の移動量(max(|x|,|y|))を取得する。ゲストがポーリングで吸い出すと減る。 */
export function coreMousePending(): number {
  return requireCcall()('webnp2_mouse_pending', 'number', [], []) as number;
}

/** バスマウスのボタン状態を送る。button: 0=左/1=右、down=1で押下。 */
export function coreMouseButton(button: number, down: number): void {
  requireCcall()('webnp2_mouse_button', null, ['number', 'number'], [button, down]);
}

/** PC-98スキャンコードを注入する。down=true でmake、false でbreak。 */
export function coreKey(code: number, down: boolean): void {
  requireCcall()('webnp2_key', null, ['number', 'number'], [code, down ? 1 : 0]);
}

/** AudioWorklet外部音声経路の有効/無効。有効中はコアのSDLコールバックが無音を返す。 */
export function coreAudioExternal(enable: boolean): void {
  requireCcall()('webnp2_audio_external', null, ['number'], [enable ? 1 : 0]);
}

/** コアのサンプリングレート(Hz)。JS側AudioContextはこのレートで作る。 */
export function coreAudioRate(): number {
  return requireCcall()('webnp2_audio_rate', 'number', [], []) as number;
}

/** 1回のrenderで得られるフレーム数(ステレオ1組=1フレーム)。0なら音声未初期化。 */
export function coreAudioChunkFrames(): number {
  return requireCcall()('webnp2_audio_chunk_frames', 'number', [], []) as number;
}

/**
 * コアのミックスを1チャンク吸い出して dst (chunkFrames*2 の Float32Array) へ
 * -1.0〜1.0 に正規化して書き込む。sound_pcmlock/unlock が1サイクル固定量消費のため、
 * dst は必ず coreAudioChunkFrames() ちょうどのフレーム数で渡すこと。
 */
export function coreAudioRenderInto(dst: Float32Array): boolean {
  const ccall = requireCcall();
  const ptr = ccall('webnp2_audio_render', 'number', [], []) as number;
  const heap = resolveHeapU8();
  if (!ptr || !heap) return false;
  // ALLOW_MEMORY_GROWTH でバッファが差し替わるため、ビューは毎回作り直す。
  const view = new Int16Array(heap.buffer, ptr, dst.length);
  for (let i = 0; i < dst.length; i++) {
    dst[i] = view[i] / 32768;
  }
  return true;
}

/**
 * PC-98キーボードBIOSリングバッファへ1エントリ(上位scan=0, 下位=SJISバイト等)を直接積む。
 * ゲスト側FEP無しで全角文字を入力するためのホスト側テキスト送信機能で使う。
 * 戻り値は 1=積めた/0=バッファ満杯。
 */
export function corePushKeyBuffer(entry: number): number {
  return requireCcall()('webnp2_push_key_buffer', 'number', ['number'], [entry]) as number;
}

/** SJIS 2バイト文字をアトミックに2エントリ積む。戻り値は 1=積めた/0=空きが2未満。 */
export function corePushKeyBufferPair(e1: number, e2: number): number {
  return requireCcall()('webnp2_push_key_buffer_pair', 'number', ['number', 'number'], [e1, e2]) as number;
}

/**
 * ゲスト常駐TSR(PASTE.COM)のメールボックス線形アドレスを取得する。
 * TSRが常駐していなければ -1。
 */
export function coreFindMailbox(): number {
  return requireCcall()('webnp2_find_mailbox', 'number', [], []) as number;
}

/** メールボックスのリングバッファ空き(最大255)を取得する。 */
export function coreMailboxSpace(addr: number): number {
  return requireCcall()('webnp2_mailbox_space', 'number', ['number'], [addr]) as number;
}

/** メールボックスへ1バイト書き込む。戻り値は 1=成功/0=満杯。 */
export function coreMailboxPut(addr: number, byte: number): number {
  return requireCcall()('webnp2_mailbox_put', 'number', ['number', 'number'], [addr, byte]) as number;
}

/** メールボックスの行書き込み中フラグを設定する(1=書き込み中)。 */
export function coreMailboxPending(addr: number, pending: number): void {
  requireCcall()('webnp2_mailbox_pending', null, ['number', 'number'], [addr, pending]);
}

/**
 * テキスト画面(TVRAM)バッファのスナップショットを取得する。
 * レイアウトは webnp2_read_tvram()/webnp2_tvram_size() の仕様に準じる
 * (リトルエンディアン: [0]=cols, [1]=rows, [2..3]=カーソルセル番号int16, [4..]=セル配列)。
 * wasmメモリから独立したコピーを返すので、呼び出し後にコア側が書き換えても影響しない。
 */
export function coreReadTvram(): Uint8Array {
  const ccall = requireCcall();
  const ptr = ccall('webnp2_read_tvram', 'number', [], []) as number;
  const size = ccall('webnp2_tvram_size', 'number', [], []) as number;
  const heap = resolveHeapU8();
  if (!heap) {
    throw new Error('HEAPU8 is not available (core not booted yet?)');
  }
  return heap.slice(ptr, ptr + size);
}
