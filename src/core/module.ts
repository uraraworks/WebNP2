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
}

declare global {
  interface Window {
    Module?: EmscriptenModule;
    FS?: EmscriptenFS;
    ccall?: CCallFn;
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
  const lines = ['[NekoProject21kai]', 'fontfile=/font.bmp'];
  if (config.hdd) {
    lines.push(`HDD1FILE=/disk/${config.hdd.name}`);
  }
  lines.push(`Latencys=${config.latencyMs ?? 40}`);
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
