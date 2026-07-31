import './ui/styles.css';
import { buildPlayerUI, type DroppedFile, type PlayerUI } from './ui/player.ts';
import { WebNP2, type DiskSlot } from './api/webnp2.ts';
import * as db from './storage/db.ts';
import type { DiskFile } from './core/module.ts';
import { resolveAudioContext } from './core/module.ts';
import { getLang, t, type StringKey } from './ui/strings.ts';

interface PendingImage {
  slot: DiskSlot;
  name: string;
  sourceKey: string;
  url?: string;
  bytes: Uint8Array;
  resumed: boolean;
}

const params = new URLSearchParams(location.search);
const hddUrl = params.get('hdd') ?? undefined;
const fd1Url = params.get('fd1') ?? undefined;
const fd2Url = params.get('fd2') ?? undefined;
const runParam = params.get('run') === '1';
// freedos=1: 同梱の FreeDOS(98) 起動FDを fd1 としてマウント対象にする(fd1指定があればそちらを優先)。
const freedosParam = params.get('freedos') === '1';

// 同梱FreeDOS(98)起動FDイメージの配置場所と、IndexedDB永続化用の固定sourceKey。
// URL由来ではなく固定キーにすることで、オーバーレイ2択/?freedos=1/FDD1挿入ボタンの
// どの経路から使っても同じ保存データ(前回の続き)を共有できる。
const FREEDOS_IMAGE_URL = './freedos/fd98_2hd.xdf';
const FREEDOS_SOURCE_KEY = 'freedos:fd98_2hd';

// URLでディスクが1つも指定されていない場合、オーバーレイに
// 「そのまま起動」/「FreeDOS(98) で起動」の2択を出す(freedos=1指定済みの場合は
// 既に起動対象が確定しているので、従来通り単一ボタンにする)。
const diskSpecified = Boolean(hddUrl || fd1Url || fd2Url || freedosParam);

// フッターに載せる本リポジトリのGitHubリンク先。
const WEBNP2_REPO_URL = 'https://github.com/uraraworks/WebNP2';
// 拡張メモリ(MB)。DOS用途では1MBで十分なので既定は1。?mem=N で変更可能。
const memParamRaw = Number(params.get('mem') ?? '');
const memParam = Number.isFinite(memParamRaw) && params.get('mem') !== null ? memParamRaw : undefined;
// clk はCPUクロック倍率(1〜32)。core/module.ts の buildCfg でクランプする。
const clkParamRaw = Number(params.get('clk') ?? '');
const clkParam = Number.isFinite(clkParamRaw) && params.get('clk') !== null ? clkParamRaw : undefined;

const app = document.getElementById('app');
if (!app) {
  throw new Error('#app not found');
}

let ui: PlayerUI;
let np2: WebNP2;
let bootStarted = false;

// ステータス行は最後に表示したメッセージを key+args で保持し、言語切替時に再適用する。
let lastStatus: { key: StringKey; args: unknown[]; isError: boolean } | null = null;

function setStatusT(key: StringKey, args: unknown[] = [], isError = false): void {
  lastStatus = { key, args, isError };
  ui.setStatus((t as (k: StringKey, ...a: unknown[]) => string)(key, ...args), isError);
}

// コア(Emscripten SDL)がSDL_SetWindowTitle経由でdocument.titleを
// 「Neko Project II kai + IA-32」に上書きするため、監視して差し戻す。
const titleEl = document.querySelector('title');
if (titleEl) {
  new MutationObserver(() => {
    if (document.title !== t('title')) {
      document.title = t('title');
    }
  }).observe(titleEl, { childList: true });
}

function applyDocumentStrings(): void {
  document.title = t('title');
  document.documentElement.lang = getLang();
  const footer = document.querySelector<HTMLElement>('.app-footer');
  if (footer) {
    footer.textContent = '';
    footer.append(`${t('footerLicense')} / `);
    const link = document.createElement('a');
    link.href = WEBNP2_REPO_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = t('footerGithubLabel');
    footer.append(link);
  }
}

function fileKeyFor(name: string, size: number): string {
  return `file:${name}:${size}`;
}

async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(t('fetchFailedNetwork', { url }));
  }
  if (!response.ok) {
    throw new Error(t('fetchFailedHttp', { url, status: response.status }));
  }
  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : null;

  if (!response.body) {
    const buf = await response.arrayBuffer();
    onProgress(buf.byteLength, total);
    return new Uint8Array(buf);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  }
  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function resolveImage(
  slot: DiskSlot,
  url: string | undefined,
  label: string,
  sourceKeyOverride?: string,
): Promise<PendingImage | undefined> {
  if (!url) return undefined;

  const sourceKey = sourceKeyOverride ?? url;
  const stored = await db.get(sourceKey);
  if (stored) {
    setStatusT('statusResumed', [{ label, name: stored.name }]);
    return {
      slot,
      name: stored.name,
      sourceKey,
      url,
      bytes: new Uint8Array(stored.bytes),
      resumed: true,
    };
  }

  const name = decodeURIComponent(url.split('/').pop() || `${slot}.img`);
  ui.setProgress(t('statusFetching', { label, name }), total_ratio(0, null));
  const bytes = await fetchWithProgress(url, (loaded, total) => {
    ui.setProgress(
      t('statusFetchingProgress', {
        label,
        name,
        loaded: formatBytes(loaded),
        total: total ? formatBytes(total) : null,
      }),
      total ? loaded / total : null,
    );
  });
  return { slot, name, sourceKey, url, bytes, resumed: false };
}

function total_ratio(loaded: number, total: number | null): number | null {
  return total ? loaded / total : null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function toDiskFile(img: PendingImage): DiskFile {
  return { name: img.name, bytes: img.bytes };
}

/**
 * WebMSX方式自動起動(run=1)ではブラウザの自動再生制限によりAudioContextがsuspendedのまま無音になる。
 * boot完了直後に状態を見てミュートバナーの表示/非表示を切り替える。
 */
let audioStateHooked = false;

function checkAudioMuted(): void {
  const audioCtx = resolveAudioContext();
  // Emscripten SDL2ポート自身もユーザー操作でresumeするため、こちらのハンドラを
  // 経由せず状態が変わることがある。statechangeで常にバナーを状態へ追従させる。
  if (audioCtx && !audioStateHooked) {
    audioStateHooked = true;
    audioCtx.addEventListener('statechange', () => checkAudioMuted());
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    ui.showMuteBanner();
  } else {
    ui.hideMuteBanner();
  }
}

/** ページ内の任意クリック/キー入力でAudioContext.resume()を試みる。成功したらバナーを消す。 */
function attemptResumeAudio(): void {
  const audioCtx = resolveAudioContext();
  if (!audioCtx) return;
  if (audioCtx.state !== 'suspended') {
    // SDL側が先にresume済みのケース。バナーだけ確実に消す。
    ui.hideMuteBanner();
    return;
  }
  audioCtx
    .resume()
    .then(() => checkAudioMuted())
    .catch(() => {
      // resume失敗時は次のクリック/キー入力で再試行する。
    });
}

async function loadAllImages(useFreeDos: boolean): Promise<{
  hdd?: PendingImage;
  fd1?: PendingImage;
  fd2?: PendingImage;
}> {
  // fd1 明示指定がなく、freedos=1 または「FreeDOS(98) で起動」選択時は同梱イメージをfd1として使う。
  const wantsBundledFreeDos = !fd1Url && (freedosParam || useFreeDos);
  const effectiveFd1Url = fd1Url ?? (wantsBundledFreeDos ? FREEDOS_IMAGE_URL : undefined);
  const effectiveFd1SourceKey = wantsBundledFreeDos ? FREEDOS_SOURCE_KEY : undefined;

  const hdd = await resolveImage('hdd', hddUrl, 'HDD');
  const fd1 = await resolveImage('fd1', effectiveFd1Url, 'FD1', effectiveFd1SourceKey);
  const fd2 = await resolveImage('fd2', fd2Url, 'FD2');
  return { hdd, fd1, fd2 };
}

async function doBoot(useFreeDos = false): Promise<void> {
  if (bootStarted) return;
  bootStarted = true;
  ui.hideOverlay();
  setStatusT('statusPreparing');

  try {
    const images = await loadAllImages(useFreeDos);
    ui.hideProgress();

    if (!images.hdd && !images.fd1 && !images.fd2) {
      setStatusT('statusNoImage');
    } else {
      setStatusT('statusCoreBooting');
    }

    await np2.boot({
      hdd: images.hdd
        ? { file: toDiskFile(images.hdd), sourceKey: images.hdd.sourceKey, url: images.hdd.url }
        : undefined,
      fd1: images.fd1
        ? { file: toDiskFile(images.fd1), sourceKey: images.fd1.sourceKey, url: images.fd1.url }
        : undefined,
      fd2: images.fd2
        ? { file: toDiskFile(images.fd2), sourceKey: images.fd2.sourceKey, url: images.fd2.url }
        : undefined,
      extMemMB: memParam,
      clkMult: clkParam,
    });

    setStatusT('statusBootSuccess');
    ui.setToolbarEnabled(true);
    updateFdSlotsUI();
    checkAudioMuted();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatusT('statusBootFailed', [{ message }], true);
    ui.hideProgress();
    ui.showOverlay();
    bootStarted = false;
  }
}

/** File を DiskFile + sourceKey に変換する（D&D・FD挿入UIの両方から使う共通経路）。 */
async function fileToDiskFileAndKey(file: File): Promise<{ diskFile: DiskFile; sourceKey: string }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const sourceKey = fileKeyFor(file.name, file.size);
  return { diskFile: { name: file.name, bytes: buf }, sourceKey };
}

async function handleDroppedFiles(files: DroppedFile[]): Promise<void> {
  if (bootStarted) {
    alert(t('diskReplaceUnsupported'));
    return;
  }

  let hdd: PendingImage | undefined;
  const fds: PendingImage[] = [];

  for (const dropped of files) {
    const { diskFile, sourceKey } = await fileToDiskFileAndKey(dropped.file);
    const pending: PendingImage = {
      slot: dropped.kind === 'hdd' ? 'hdd' : fds.length === 0 ? 'fd1' : 'fd2',
      name: diskFile.name,
      sourceKey,
      bytes: diskFile.bytes,
      resumed: false,
    };
    if (dropped.kind === 'hdd') {
      hdd = pending;
    } else if (fds.length < 2) {
      fds.push(pending);
    }
  }

  bootStarted = true;
  ui.hideOverlay();
  setStatusT('statusCoreBooting');
  try {
    await np2.boot({
      hdd: hdd ? { file: toDiskFile(hdd), sourceKey: hdd.sourceKey } : undefined,
      fd1: fds[0] ? { file: toDiskFile(fds[0]), sourceKey: fds[0].sourceKey } : undefined,
      fd2: fds[1] ? { file: toDiskFile(fds[1]), sourceKey: fds[1].sourceKey } : undefined,
      extMemMB: memParam,
      clkMult: clkParam,
    });
    setStatusT('statusBootSuccess');
    ui.setToolbarEnabled(true);
    updateFdSlotsUI();
    checkAudioMuted();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatusT('statusBootFailed', [{ message }], true);
    ui.showOverlay();
    bootStarted = false;
  }
}

function updateFdSlotsUI(): void {
  const mounted = np2.getMountedImages();
  ui.updateSlots({
    fd1: mounted.find((m) => m.slot === 'fd1')?.name,
    fd2: mounted.find((m) => m.slot === 'fd2')?.name,
    hdd: mounted.find((m) => m.slot === 'hdd')?.name,
  });
}

async function handleInsertFd(drive: 1 | 2, file: File): Promise<void> {
  try {
    const { diskFile, sourceKey } = await fileToDiskFileAndKey(file);
    await np2.insertFd(drive, diskFile, sourceKey);
    updateFdSlotsUI();
    setStatusT('statusFdInserted', [{ drive, name: diskFile.name }]);
  } catch (err) {
    setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
  }
}

/** FDD1スロットの「FreeDOS(98) 挿入」ボタン。同梱イメージをfetchしてFDD1へ挿入する(既存 insertFd 経由)。 */
async function handleInsertFreeDos(): Promise<void> {
  try {
    const bytes = await fetchWithProgress(FREEDOS_IMAGE_URL, (loaded, total) => {
      ui.setProgress(
        t('statusFetchingProgress', {
          label: 'FDD1',
          name: 'fd98_2hd.xdf',
          loaded: formatBytes(loaded),
          total: total ? formatBytes(total) : null,
        }),
        total_ratio(loaded, total),
      );
    });
    ui.hideProgress();
    const diskFile: DiskFile = { name: 'fd98_2hd.xdf', bytes };
    await np2.insertFd(1, diskFile, FREEDOS_SOURCE_KEY, FREEDOS_IMAGE_URL);
    updateFdSlotsUI();
    setStatusT('statusFreeDosInserted', [{ drive: 1 }]);
  } catch (err) {
    ui.hideProgress();
    setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
  }
}

async function handleEjectFd(drive: 1 | 2): Promise<void> {
  try {
    await np2.ejectFd(drive);
    updateFdSlotsUI();
    setStatusT('statusFdEjected', [{ drive }]);
  } catch (err) {
    setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
  }
}

async function handleCreateBlankFd(drive: 1 | 2): Promise<void> {
  try {
    const blank = np2.createBlankFd();
    await np2.insertFd(drive, blank, fileKeyFor(blank.name, blank.bytes.length));
    updateFdSlotsUI();
    setStatusT('statusFdInserted', [{ drive, name: blank.name }]);
  } catch (err) {
    setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
  }
}

function init(): void {
  applyDocumentStrings();
  ui = buildPlayerUI(
    app!,
    {
      onStart: () => {
        attemptResumeAudio();
        void doBoot(false);
      },
      onStartFreeDos: () => {
        attemptResumeAudio();
        void doBoot(true);
      },
      onExportDisk: (slot) => void np2.exportDisk(slot),
      onResetToOriginal: () => void chooseAndReset(),
      onFullscreen: () => void np2.fullscreen(),
      onFilesDropped: (files) => void handleDroppedFiles(files),
      onLangChanged: () => {
        applyDocumentStrings();
        if (lastStatus) {
          ui.setStatus(
            (t as (k: StringKey, ...a: unknown[]) => string)(lastStatus.key, ...lastStatus.args),
            lastStatus.isError,
          );
        }
      },
      onMachineReset: () => {
        try {
          np2.resetMachine();
          setStatusT('statusMachineReset');
        } catch (err) {
          setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
        }
      },
      onInsertFd: (drive, file) => void handleInsertFd(drive, file),
      onInsertFreeDos: () => void handleInsertFreeDos(),
      onEjectFd: (drive) => void handleEjectFd(drive),
      onCreateBlankFd: (drive) => void handleCreateBlankFd(drive),
      onSaveState: () => void np2.saveState(),
      onLoadState: () => void np2.loadState(),
    },
    { offerFreeDosChoice: !diskSpecified },
  );
  np2 = new WebNP2(ui.canvas);
  np2.on('log', ({ level, message }) => {
    if (level === 'error') console.error('[WebNP2]', message);
    else console.log('[WebNP2]', message);
  });
  np2.on('fdChanged', () => updateFdSlotsUI());
  np2.on('stateSaved', () => setStatusT('statusStateSaved'));
  np2.on('stateLoaded', () => setStatusT('statusStateLoaded'));
  ui.setToolbarEnabled(false);

  window.addEventListener('error', (e) => {
    console.error('[WebNP2] uncaught error', e.error ?? e.message);
  });

  // WebMSX方式: ページ内の任意クリック/キー入力でAudioContextのresumeを試みる
  // (自動起動時のミュートバナー解除、および通常起動時の保険を兼ねる)。
  document.addEventListener('click', attemptResumeAudio);
  document.addEventListener('keydown', attemptResumeAudio);

  // run=1 の場合はオーバーレイのクリック操作を待たずページロード後すぐにコアを起動する
  // (ディスク未指定でもrun=1だけで自動起動する)。
  if (runParam) {
    void doBoot();
  }
}

async function chooseAndReset(): Promise<void> {
  const slots = np2.getMountedImages();
  if (slots.length === 0) {
    alert(t('noMountedImage'));
    return;
  }
  const target =
    slots.length === 1 ? slots[0].slot : await pickSlot(slots.map((s) => s.slot), t('pickSlotActionReset'));
  if (!target) return;
  await np2.resetToOriginal(target);
}

async function pickSlot(slots: DiskSlot[], actionLabel: string): Promise<DiskSlot | undefined> {
  const input = prompt(t('pickSlotPrompt', { action: actionLabel, slots: slots.join(', ') }), slots[0]);
  if (!input) return undefined;
  return slots.includes(input as DiskSlot) ? (input as DiskSlot) : undefined;
}

init();
