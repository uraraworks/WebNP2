import './ui/styles.css';
import {
  buildPlayerUI,
  classifyDroppedFile,
  type DroppedFile,
  type LibraryNode,
  type PlayerUI,
} from './ui/player.ts';
import { extractArchive, isArchive } from './api/archive.ts';
import { buildLibraryNodes, isLibraryDiskRecord } from './api/library.ts';
import { WebNP2, type DiskSlot } from './api/webnp2.ts';
import { Bridge } from './api/bridge.ts';
import * as db from './storage/db.ts';
import type { DiskFile } from './core/module.ts';
import {
  coreFindMailbox,
  coreMouseButton,
  coreMouseCaptured,
  coreMouseMove,
  coreMousePending,
  coreMouseToggle,
  resolveAudioContext,
} from './core/module.ts';
import { getWorkletAudioContext, startWorkletAudio } from './core/audio.ts';
import { getLang, t, type StringKey } from './ui/strings.ts';
import { deleteRom, listRoms, loadRomsForBoot, saveRomFiles } from './api/roms.ts';
import { createFormattedFd } from './api/fat.ts';
import type { FmTarget } from './ui/filemanager.ts';

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

// テキスト送信(全角ペースト)機能の表示制御。
// キーバッファ注入の全角はNEC MS-DOSのCONで破棄されるため、既定では非表示にし、
// 全角が届く同梱FreeDOS(98)がマウントされているときだけ自動表示する。
// ?paste=1 で常時表示、?paste=0 で常時非表示に上書きできる。
const pasteParam = params.get('paste');
const FREEDOS_SOURCE_KEY = 'freedos:fd98_2hd';

// URLでディスクが1つも指定されていない場合、オーバーレイに
// 「そのまま起動」/「FreeDOS(98) で起動」の2択を出す(freedos=1指定済みの場合は
// 既に起動対象が確定しているので、従来通り単一ボタンにする)。
const diskSpecified = Boolean(hddUrl || fd1Url || fd2Url || freedosParam);

// フッターに載せる本リポジトリのGitHubリンク先。
const WEBNP2_REPO_URL = 'https://github.com/uraraworks/WebNP2';
// フッターの著作権表示リンク先。
const URARA_WORKS_URL = 'https://www.urara-works.jp/';
// 拡張メモリ(MB)。DOS用途では1MBで十分なので既定は1。?mem=N で変更可能。
const memParamRaw = Number(params.get('mem') ?? '');
const memParam = Number.isFinite(memParamRaw) && params.get('mem') !== null ? memParamRaw : undefined;
// clk はCPUクロック倍率(1〜32)。core/module.ts の buildCfg でクランプする。
const clkParamRaw = Number(params.get('clk') ?? '');
const clkParam = Number.isFinite(clkParamRaw) && params.get('clk') !== null ? clkParamRaw : undefined;
// worklet=0 でAudioWorklet音声出力を無効化し、従来のSDL(ScriptProcessor)経路に戻す。
const workletEnabled = params.get('worklet') !== '0';
// alat=N でAudioWorkletリングの下限水位(ms)を指定。小さいほど低遅延だが途切れやすい。
const alatRaw = Number(params.get('alat') ?? '');
const alatParam = Number.isFinite(alatRaw) && params.get('alat') !== null ? alatRaw : undefined;
// perf=1 で性能計測オーバーレイ(FPS/メインスレッド占有/音声供給)を表示する。
const perfParam = params.get('perf') === '1';

/**
 * `?bridge=...` の値から接続先WebSocket URLを決める。
 * 未指定ならundefined。'1'/空文字なら既定ポート、数値のみならそのポート、
 * それ以外は値をそのままURLとして使う。
 */
function resolveBridgeUrl(): string | undefined {
  const raw = params.get('bridge');
  if (raw === null) return undefined;
  if (raw === '1' || raw === '') return 'ws://127.0.0.1:3098';
  if (/^\d+$/.test(raw)) return `ws://127.0.0.1:${raw}`;
  return raw;
}
const bridgeUrl = resolveBridgeUrl();

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
    const copyrightLink = document.createElement('a');
    copyrightLink.href = URARA_WORKS_URL;
    copyrightLink.target = '_blank';
    copyrightLink.rel = 'noopener';
    copyrightLink.textContent = t('footerCopyright');
    footer.append(copyrightLink, ' / ');

    const githubLink = document.createElement('a');
    githubLink.href = WEBNP2_REPO_URL;
    githubLink.target = '_blank';
    githubLink.rel = 'noopener';
    githubLink.textContent = t('footerGithubLabel');
    footer.append(githubLink, ' / ');

    const aboutLink = document.createElement('a');
    aboutLink.href = `./about.html?lang=${getLang()}`;
    aboutLink.target = '_blank';
    aboutLink.rel = 'noopener';
    aboutLink.textContent = t('footerAboutLabel');
    footer.append(aboutLink);
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
/** 実行画面をネイティブ解像度(640x400)のPNGとしてダウンロードさせる。
 *  WebGLの描画バッファは module.ts 側で preserveDrawingBuffer=true を強制済み。 */
function saveScreenshot(): void {
  const src = ui.canvas;
  const tmp = document.createElement('canvas');
  tmp.width = src.width;
  tmp.height = src.height;
  const ctx = tmp.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(src, 0, 0);
  tmp.toBlob((blob) => {
    if (!blob) return;
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .slice(0, 15);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webnp2_${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setStatusT('statusScreenshotSaved');
  }, 'image/png');
}

// Escキー等でブラウザのpointer lockが解除されたとき、コア側のキャプチャ状態が
// 残っているとボタンの挙動と食い違うため、コア側もトグルして同期する。
document.addEventListener('pointerlockchange', () => {
  try {
    if (!document.pointerLockElement && coreMouseCaptured()) {
      coreMouseToggle();
      ui.setMouseCaptured(false);
      setStatusT('statusMouseReleased');
    }
  } catch {
    // 起動前(ccall未定義)は何もしない
  }
});

// マウス追従モード(キャプチャなしでホストのカーソル位置にゲストのバスマウスを追従させる)の状態。
// バスマウスは相対移動のみのため、開始時に画面外へ押し付けて左上へホーミングしてから
// 相対移動で絶対座標を推定する。
let mouseTrackTarget: { x: number; y: number } | null = null;
let mouseTrackPos: { x: number; y: number } = { x: 0, y: 0 };
let mouseTrackTimer: number | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** タッチ由来のクリックは「カーソルが目標へ到達してから」ボタンを押す必要があるため、追従の収束を待つ。 */
async function trackSettle(timeoutMs = 800): Promise<void> {
  const t0 = performance.now();
  while (mouseTrackTarget && (mouseTrackPos.x !== mouseTrackTarget.x || mouseTrackPos.y !== mouseTrackTarget.y)) {
    if (performance.now() - t0 > timeoutMs) break;
    await sleep(30);
  }
}

// タッチ操作(クリック/ドラッグ)は順序が入れ替わると押しっぱなし等になるため直列化する。
let touchOpChain: Promise<void> = Promise.resolve();
function queueTouchOp(op: () => Promise<void>): void {
  touchOpChain = touchOpChain.then(op).catch(() => {});
}

async function mouseTrackHome(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    coreMouseMove(-64, -64);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}

function startMouseTrackTimer(): void {
  if (mouseTrackTimer !== null) return;
  mouseTrackTimer = window.setInterval(() => {
    if (!mouseTrackTarget) return;
    // ゲスト側の消費(coreMousePending)が詰まっている間は送らずに足踏みする。
    if (coreMousePending() > 96) return;
    for (let step = 0; step < 2; step++) {
      const dx = mouseTrackTarget.x - mouseTrackPos.x;
      const dy = mouseTrackTarget.y - mouseTrackPos.y;
      if (dx === 0 && dy === 0) break;
      const clamp = (v: number) => Math.max(-64, Math.min(64, v));
      const mx = clamp(dx);
      const my = clamp(dy);
      coreMouseMove(mx, my);
      mouseTrackPos = { x: mouseTrackPos.x + mx, y: mouseTrackPos.y + my };
    }
  }, 60);
}

function stopMouseTrackTimer(): void {
  if (mouseTrackTimer !== null) {
    clearInterval(mouseTrackTimer);
    mouseTrackTimer = null;
  }
  mouseTrackTarget = null;
}

// SDLのAudioContextに加え、AudioWorklet経路が有効なときはその専用コンテキストも
// resume/バナー判定の対象にする(実際に音が出るのはワークレット側のため)。
function audioContexts(): AudioContext[] {
  const list: AudioContext[] = [];
  const sdl = resolveAudioContext();
  if (sdl) list.push(sdl);
  const worklet = getWorkletAudioContext();
  if (worklet) list.push(worklet);
  return list;
}

const audioStateHooked = new WeakSet<AudioContext>();

function checkAudioMuted(): void {
  const ctxs = audioContexts();
  // Emscripten SDL2ポート自身もユーザー操作でresumeするため、こちらのハンドラを
  // 経由せず状態が変わることがある。statechangeで常にバナーを状態へ追従させる。
  for (const ctx of ctxs) {
    if (!audioStateHooked.has(ctx)) {
      audioStateHooked.add(ctx);
      ctx.addEventListener('statechange', () => checkAudioMuted());
    }
  }
  // 実際に鳴らすのはワークレット側(有効時)なので、バナーはそちらの状態を優先する。
  const primary = getWorkletAudioContext() ?? resolveAudioContext();
  if (primary && primary.state === 'suspended') {
    ui.showMuteBanner();
  } else {
    ui.hideMuteBanner();
  }
}

/** ページ内の任意クリック/キー入力でAudioContext.resume()を試みる。成功したらバナーを消す。 */
function attemptResumeAudio(): void {
  const ctxs = audioContexts();
  if (ctxs.length === 0) return;
  let resuming = false;
  for (const ctx of ctxs) {
    if (ctx.state === 'suspended') {
      resuming = true;
      ctx
        .resume()
        .then(() => checkAudioMuted())
        .catch(() => {
          // resume失敗時は次のクリック/キー入力で再試行する。
        });
    }
  }
  if (!resuming) {
    // SDL側が先にresume済みのケース。バナーだけ確実に消す。
    checkAudioMuted();
  }
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

/**
 * 解決済みの hdd/fd1/fd2 (PendingImage) で np2.boot を実行する共通処理。
 * 呼び出し側であらかじめ bootStarted=true にし、ui.hideOverlay() を呼んでおくこと。
 * fetch/DB読み出し等の準備段階のエラーはこの関数の外側で処理する。
 */
async function bootWithImages(images: {
  hdd?: PendingImage;
  fd1?: PendingImage;
  fd2?: PendingImage;
}): Promise<void> {
  if (!images.hdd && !images.fd1 && !images.fd2) {
    setStatusT('statusNoImage');
  } else {
    setStatusT('statusCoreBooting');
  }

  try {
    const roms = await loadRomsForBoot();

    await np2.boot({
      hdd: images.hdd
        ? {
            file: toDiskFile(images.hdd),
            sourceKey: images.hdd.sourceKey,
            url: images.hdd.url,
            alreadyPersisted: images.hdd.resumed,
          }
        : undefined,
      fd1: images.fd1
        ? {
            file: toDiskFile(images.fd1),
            sourceKey: images.fd1.sourceKey,
            url: images.fd1.url,
            alreadyPersisted: images.fd1.resumed,
          }
        : undefined,
      fd2: images.fd2
        ? {
            file: toDiskFile(images.fd2),
            sourceKey: images.fd2.sourceKey,
            url: images.fd2.url,
            alreadyPersisted: images.fd2.resumed,
          }
        : undefined,
      extMemMB: memParam,
      clkMult: clkParam,
      roms,
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

async function doBoot(useFreeDos = false): Promise<void> {
  if (bootStarted) return;
  bootStarted = true;
  ui.hideOverlay();
  setStatusT('statusPreparing');

  try {
    const images = await loadAllImages(useFreeDos);
    ui.hideProgress();
    await bootWithImages(images);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatusT('statusBootFailed', [{ message }], true);
    ui.hideProgress();
    ui.showOverlay();
    bootStarted = false;
  }
}

/** ディスクライブラリのレコードを取得する。rom:/state: プレフィックスとディスク以外は除外する。 */
async function listStoredDiskImages(): Promise<db.StoredImage[]> {
  const all = await db.getAllStored();
  return all.filter((item) => isLibraryDiskRecord(item, classifyDroppedFile));
}

/**
 * ディスクライブラリ(IndexedDB保存済み)をグループ単位にまとめて返す。
 * アーカイブ由来で複数ディスクを含むものはフォルダ(group)1件、それ以外は単体(item)1件になる。
 */
async function listDiskLibrary(): Promise<LibraryNode[]> {
  return buildLibraryNodes(await listStoredDiskImages(), classifyDroppedFile);
}

/** ディスクライブラリのエントリから起動する(起動前オーバーレイ用)。HDDはHDDとして、FDはFD1として起動する。 */
async function bootFromLibrary(sourceKey: string): Promise<void> {
  if (bootStarted) return;
  const stored = await db.get(sourceKey);
  if (!stored) return;
  const kind = classifyDroppedFile(stored.name);
  if (!kind) return;

  const pending: PendingImage = {
    slot: kind === 'hdd' ? 'hdd' : 'fd1',
    name: stored.name,
    sourceKey,
    bytes: new Uint8Array(stored.bytes),
    resumed: true,
  };

  bootStarted = true;
  ui.hideOverlay();
  setStatusT('statusPreparing');
  await bootWithImages(kind === 'hdd' ? { hdd: pending } : { fd1: pending });
}

/** ディスクライブラリのFDイメージをFDD1/FDD2へ挿入する。起動前ならそのFDをセットした状態で起動する。 */
async function insertFdFromLibrary(drive: 1 | 2, sourceKey: string): Promise<void> {
  try {
    const stored = await db.get(sourceKey);
    if (!stored) return;
    const diskFile: DiskFile = { name: stored.name, bytes: new Uint8Array(stored.bytes) };
    if (!bootStarted) {
      const pending: PendingImage = {
        slot: drive === 1 ? 'fd1' : 'fd2',
        name: stored.name,
        sourceKey,
        bytes: diskFile.bytes,
        resumed: true,
      };
      bootStarted = true;
      ui.hideOverlay();
      setStatusT('statusPreparing');
      await bootWithImages(drive === 1 ? { fd1: pending } : { fd2: pending });
      return;
    }
    await np2.insertFd(drive, diskFile, sourceKey);
    updateFdSlotsUI();
    setStatusT('statusFdInserted', [{ drive, name: diskFile.name }]);
  } catch (err) {
    setStatusT('statusBootFailed', [{ message: err instanceof Error ? err.message : String(err) }], true);
  }
}

/** ディスクライブラリのエントリを削除する。 */
async function deleteLibraryEntry(sourceKey: string): Promise<void> {
  await db.delete(sourceKey);
}

/** ライブラリエントリの表示名を変更する。実ファイル名(拡張子)は変えないため種別判定は壊れない。 */
async function renameLibraryEntry(sourceKey: string, displayName: string): Promise<void> {
  const stored = await db.get(sourceKey);
  if (!stored) return;
  const trimmed = displayName.trim();
  // 空文字にされたら「表示名なし」に戻し、元のファイル名表示へフォールバックさせる。
  await db.updateMeta(sourceKey, { displayName: trimmed === '' ? undefined : trimmed });
}

/** グループ(アーカイブ由来フォルダ)の表示名を変更する。所属する全レコードの groupName を更新する。 */
async function renameLibraryGroup(groupId: string, groupName: string): Promise<void> {
  const trimmed = groupName.trim();
  if (trimmed === '') return;
  const stored = await listStoredDiskImages();
  for (const item of stored) {
    if (item.group !== groupId) continue;
    await db.updateMeta(item.sourceKey, { groupName: trimmed });
  }
}

/** グループを丸ごと削除する(所属する全ディスクイメージを削除)。 */
async function deleteLibraryGroup(groupId: string): Promise<void> {
  const stored = await listStoredDiskImages();
  for (const item of stored) {
    if (item.group !== groupId) continue;
    await db.delete(item.sourceKey);
  }
}

// --- アーカイブ(ZIP/LZH)の展開とライブラリ登録 ---

/** ライブラリへ登録した(またはこれから起動に使う)ディスクイメージ1件。 */
interface RegisteredImage {
  name: string;
  sourceKey: string;
  bytes: Uint8Array;
  kind: 'hdd' | 'fd';
}

/** アーカイブ内パスからファイル名部分のみを取り出す(グループ内表示とイメージ種別判定に使う)。 */
function baseNameOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

/**
 * 1つの File をディスクイメージ群に展開する。
 * ZIP/LZH の場合は中身を取り出し、ディスクイメージ以外(readme等)は捨てる。
 * 複数枚を含むアーカイブは1グループとしてまとめ、ライブラリでフォルダ表示される。
 */
async function expandFileToImages(file: File): Promise<RegisteredImage[]> {
  if (!isArchive(file.name)) {
    const kind = classifyDroppedFile(file.name);
    if (!kind) return [];
    const bytes = new Uint8Array(await file.arrayBuffer());
    return [{ name: file.name, sourceKey: fileKeyFor(file.name, file.size), bytes, kind }];
  }

  const archiveBytes = new Uint8Array(await file.arrayBuffer());
  const entries = await extractArchive(file.name, archiveBytes);
  const groupId = `arc:${file.name}:${file.size}`;
  const images: RegisteredImage[] = [];
  for (const entry of entries) {
    const name = baseNameOf(entry.name);
    const kind = classifyDroppedFile(name);
    if (!kind) continue;
    // アーカイブ間で同名同サイズのディスクが衝突しないよう、キーにアーカイブ側の情報を含める。
    images.push({ name, sourceKey: `${groupId}/${entry.name}`, bytes: entry.data, kind });
  }
  return images;
}

/**
 * ドロップ/選択された File 群を展開し、ディスクイメージをライブラリ(IndexedDB)へ保存する。
 * 2枚以上を含むアーカイブはグループ(フォルダ)としてまとめる。
 * 戻り値は保存したイメージ(起動/挿入に流用するためバイト列を保持したまま返す)。
 */
async function registerFilesToLibrary(files: File[]): Promise<RegisteredImage[]> {
  const registered: RegisteredImage[] = [];
  for (const file of files) {
    let images: RegisteredImage[];
    try {
      images = await expandFileToImages(file);
    } catch (err) {
      setStatusT(
        'statusArchiveFailed',
        [{ name: file.name, message: err instanceof Error ? err.message : String(err) }],
        true,
      );
      continue;
    }
    // 単体イメージ、および中身が1枚だけのアーカイブはグループを作らずフラットに置く。
    const grouped = isArchive(file.name) && images.length > 1;
    const groupId = grouped ? `arc:${file.name}:${file.size}` : undefined;
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const bytes = image.bytes;
      // 同じファイルを再ドロップしたときに、以前付けた表示名を消さない。
      await db.putPreservingMeta({
        sourceKey: image.sourceKey,
        name: image.name,
        bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        savedAt: Date.now(),
        group: groupId,
        groupName: grouped ? file.name : undefined,
        groupIndex: grouped ? i : undefined,
      });
      registered.push(image);
    }
  }
  return registered;
}

// --- ファイルマネージャ(FTPクライアント風2ペイン)向け配線 ---
// FAT12/16として読み書き可能なFD拡張子。D88(セクタ形式が異なり非対応)やHDDはここに含めない。
const FM_EDITABLE_FD_EXTENSIONS = ['.xdf', '.hdm', '.dup', '.fdd', '.fdi'];

function isFmEditableFdName(name: string): boolean {
  const lower = name.toLowerCase();
  return FM_EDITABLE_FD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** sourceKeyが現在fd1/fd2いずれかにマウント中なら、そのスロット名を返す。 */
function findMountedSlotForSourceKey(sourceKey: string): 'fd1' | 'fd2' | undefined {
  const found = np2.getMountedImages().find((e) => e.sourceKey === sourceKey && (e.slot === 'fd1' || e.slot === 'fd2'));
  return found?.slot as 'fd1' | 'fd2' | undefined;
}

/** ライブラリ由来のtargetがマウント中なら対応するスロット名を返す(マウント中はスロット側APIへ振り分けるため)。 */
function resolveFmSlot(target: FmTarget): 'fd1' | 'fd2' | undefined {
  if (target.kind === 'slot') return target.ref as 'fd1' | 'fd2';
  return findMountedSlotForSourceKey(target.ref);
}

/** ファイルマネージャの対象セレクタ一覧: FD1/FD2(実行中スロット) + ライブラリ内FDイメージ(D88/HDD等は除外)。 */
async function listFmTargets(): Promise<FmTarget[]> {
  const targets: FmTarget[] = [];
  const mounted = np2.getMountedImages();
  for (const drive of [1, 2] as const) {
    const slot = drive === 1 ? 'fd1' : 'fd2';
    const m = mounted.find((e) => e.slot === slot);
    targets.push({
      kind: 'slot',
      ref: slot,
      drive,
      name: m?.name,
      mounted: !!m,
      editable: !!m && isFmEditableFdName(m.name),
    });
  }
  const all = await db.getAllStored();
  for (const item of all) {
    if (item.sourceKey.startsWith('rom:') || item.sourceKey.startsWith('state:')) continue;
    if (!isFmEditableFdName(item.name)) continue;
    targets.push({
      kind: 'library',
      ref: item.sourceKey,
      name: item.name,
      mounted: !!findMountedSlotForSourceKey(item.sourceKey),
      editable: true,
    });
  }
  return targets;
}

async function fmListDir(target: FmTarget, path: string) {
  const slot = resolveFmSlot(target);
  if (slot) return np2.diskListFiles(slot, path);
  return np2.libraryListFiles(target.ref, path);
}

async function fmReadFile(target: FmTarget, path: string): Promise<Uint8Array> {
  const slot = resolveFmSlot(target);
  if (slot) return np2.diskReadFile(slot, path);
  return np2.libraryReadFile(target.ref, path);
}

async function fmWriteFile(target: FmTarget, path: string, data: Uint8Array): Promise<void> {
  const slot = resolveFmSlot(target);
  if (slot) {
    await np2.diskWriteFile(slot, path, data);
    return;
  }
  await np2.libraryWriteFile(target.ref, path, data);
}

async function fmDeleteFile(target: FmTarget, path: string): Promise<void> {
  const slot = resolveFmSlot(target);
  if (slot) {
    await np2.diskDeleteFile(slot, path);
    return;
  }
  await np2.libraryDeleteFile(target.ref, path);
}

async function fmMakeDir(target: FmTarget, path: string): Promise<void> {
  const slot = resolveFmSlot(target);
  if (slot) {
    await np2.diskMakeDir(slot, path);
    return;
  }
  await np2.libraryMakeDir(target.ref, path);
}

/** FAT12フォーマット済みの転送用FDを新規生成し、既存ライブラリ名と重複しないよう連番を振ってIndexedDBへ保存する。 */
async function fmCreateTransferFd(desiredName: string): Promise<{ sourceKey: string; name: string }> {
  const all = await db.getAllStored();
  const existing = new Set(all.map((i) => i.name.toLowerCase()));
  const dot = desiredName.lastIndexOf('.');
  const base = dot > 0 ? desiredName.slice(0, dot) : desiredName;
  const ext = dot > 0 ? desiredName.slice(dot) : '';
  let name = desiredName;
  for (let i = 2; existing.has(name.toLowerCase()); i++) {
    name = `${base}${i}${ext}`;
  }
  const bytes = createFormattedFd();
  const sourceKey = fileKeyFor(name, bytes.length);
  await db.put({
    sourceKey,
    name,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    savedAt: Date.now(),
  });
  return { sourceKey, name };
}

/** File を DiskFile + sourceKey に変換する（D&D・FD挿入UIの両方から使う共通経路）。 */
async function fileToDiskFileAndKey(file: File): Promise<{ diskFile: DiskFile; sourceKey: string }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const sourceKey = fileKeyFor(file.name, file.size);
  return { diskFile: { name: file.name, bytes: buf }, sourceKey };
}

async function handleDroppedFiles(files: DroppedFile[]): Promise<void> {
  const hasArchive = files.some((f) => f.kind === 'archive');
  // 実行中のディスク差し替えはコアが未対応。ただしアーカイブはライブラリへの取り込みとして受け付ける。
  if (bootStarted && !hasArchive) {
    alert(t('diskReplaceUnsupported'));
    return;
  }

  const registered = await registerFilesToLibrary(files.map((f) => f.file));
  if (registered.length === 0) {
    alert(t('dropNoDiskImage'));
    return;
  }

  // 実行中の取り込み、および複数枚を含むアーカイブは起動せずライブラリを開いて選ばせる。
  if (bootStarted || (hasArchive && registered.length > 1)) {
    setStatusT('statusLibraryAdded', [{ count: registered.length }]);
    ui.openDiskLibrary();
    return;
  }

  let hdd: PendingImage | undefined;
  const fds: PendingImage[] = [];

  for (const image of registered) {
    const pending: PendingImage = {
      slot: image.kind === 'hdd' ? 'hdd' : fds.length === 0 ? 'fd1' : 'fd2',
      name: image.name,
      sourceKey: image.sourceKey,
      bytes: image.bytes,
      // 直前に registerFilesToLibrary で保存済みなので、boot直後の重複保存を避ける。
      resumed: true,
    };
    if (image.kind === 'hdd') {
      hdd = pending;
    } else if (fds.length < 2) {
      fds.push(pending);
    }
  }

  bootStarted = true;
  ui.hideOverlay();
  await bootWithImages({ hdd, fd1: fds[0], fd2: fds[1] });
}

function hasResidentPasteHelper(): boolean {
  try {
    return coreFindMailbox() >= 0;
  } catch {
    // 未boot時などccall未定義。
    return false;
  }
}

function updatePasteFeature(): void {
  // ボタン自体は起動後なら出す(全角が未対応でもバー内から有効化できるため)。
  // ?paste=0 のときだけ完全に隠す。
  const buttonVisible = pasteParam !== '0' && np2.isBooted();
  const fullwidthAvailable =
    pasteParam === '1' ||
    np2.getMountedImages().some((m) => m.sourceKey.startsWith('freedos:')) ||
    hasResidentPasteHelper();
  ui.setPasteFeature({ buttonVisible, fullwidthAvailable });
}

/** テキスト送信バーの「日本語入力を有効化」ボタン。ゲスト常駐ヘルパーを導入する。 */
async function handleSetupPasteHelper(): Promise<void> {
  setStatusT('statusPasteHelperSetup');
  try {
    const result = await np2.setupPasteHelper();
    if (result.ok) {
      setStatusT('statusPasteHelperOk');
    } else {
      setStatusT('statusPasteHelperFailed', [{ message: result.message }], true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatusT('statusPasteHelperFailed', [{ message }], true);
  }
  updatePasteFeature();
}

let pasteFeaturePollTimer: ReturnType<typeof setInterval> | null = null;

/** ゲスト常駐TSRを自動検知してテキスト送信UIを出すため、boot後3秒間隔で判定を更新する。多重起動防止。 */
function startPasteFeaturePolling(): void {
  if (pasteFeaturePollTimer !== null) return;
  pasteFeaturePollTimer = setInterval(() => {
    updatePasteFeature();
  }, 3000);
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
  // アーカイブはライブラリへ取り込み、1枚だけならそのまま挿入、複数枚ならライブラリから選ばせる。
  if (isArchive(file.name)) {
    const registered = await registerFilesToLibrary([file]);
    const fds = registered.filter((image) => image.kind === 'fd');
    if (fds.length === 0) {
      alert(t('dropNoDiskImage'));
      return;
    }
    if (fds.length === 1) {
      await insertFdFromLibrary(drive, fds[0].sourceKey);
      return;
    }
    setStatusT('statusLibraryAdded', [{ count: registered.length }]);
    ui.openDiskLibrary();
    return;
  }

  try {
    const { diskFile, sourceKey } = await fileToDiskFileAndKey(file);
    // 起動前はライブ挿入できないため、そのFDをセットした状態で起動する(D&DのFD起動と同じ)。
    if (!bootStarted) {
      const pending: PendingImage = {
        slot: drive === 1 ? 'fd1' : 'fd2',
        name: diskFile.name,
        sourceKey,
        bytes: diskFile.bytes,
        resumed: false,
      };
      bootStarted = true;
      ui.hideOverlay();
      await bootWithImages(drive === 1 ? { fd1: pending } : { fd2: pending });
      return;
    }
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

async function handlePasteText(text: string): Promise<void> {
  try {
    const { skipped } = await np2.pasteText(text);
    if (skipped.length > 0) {
      setStatusT('statusPasteSkipped', [{ count: skipped.length, chars: skipped.join(', ') }], true);
    }
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
      onScreenshot: () => saveScreenshot(),
      onMouseToggle: () => {
        // キャプチャ開始はpointer lock要求になるため、クリックハンドラ内で同期的に呼ぶ。
        const captured = coreMouseToggle();
        ui.setMouseCaptured(!!captured);
        setStatusT(captured ? 'statusMouseCaptured' : 'statusMouseReleased');
      },
      onMouseTrackStart: () => {
        void (async () => {
          await mouseTrackHome();
          mouseTrackPos = { x: 0, y: 0 };
          mouseTrackTarget = null;
          startMouseTrackTimer();
          setStatusT('statusMouseResynced');
        })();
      },
      onMouseTrackStop: () => {
        stopMouseTrackTimer();
      },
      onMouseTrack: (x, y) => {
        mouseTrackTarget = { x, y };
      },
      onMouseButton: (button, down) => {
        coreMouseButton(button, down ? 1 : 0);
      },
      onVirtualKey: (code, down) => {
        try {
          np2.sendKey(code, down);
        } catch {
          // 起動前は無視
        }
      },
      onTouchClick: (x, y, button) =>
        queueTouchOp(async () => {
          mouseTrackTarget = { x, y };
          await trackSettle();
          coreMouseButton(button, 1);
          await sleep(60);
          coreMouseButton(button, 0);
        }),
      onTouchDragStart: () =>
        queueTouchOp(async () => {
          await trackSettle();
          coreMouseButton(0, 1);
        }),
      onTouchDragEnd: () =>
        queueTouchOp(async () => {
          await trackSettle();
          coreMouseButton(0, 0);
        }),
      onInsertFd: (drive, file) => void handleInsertFd(drive, file),
      onInsertFreeDos: () => void handleInsertFreeDos(),
      onEjectFd: (drive) => void handleEjectFd(drive),
      onCreateBlankFd: (drive) => void handleCreateBlankFd(drive),
      onSaveState: () => void np2.saveState(),
      onLoadState: () => void np2.loadState(),
      onPasteText: (text) => void handlePasteText(text),
      onSetupPasteHelper: () => void handleSetupPasteHelper(),
      onListRoms: () => listRoms(),
      onSaveRomFiles: async (files) => {
        const inputs = await Promise.all(
          files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
        );
        return saveRomFiles(inputs);
      },
      onDeleteRom: (name) => deleteRom(name),
      onListLibrary: () => listDiskLibrary(),
      onLibraryBoot: (sourceKey) => bootFromLibrary(sourceKey),
      onLibraryInsertFd: (drive, sourceKey) => insertFdFromLibrary(drive, sourceKey),
      onLibraryDelete: (sourceKey) => deleteLibraryEntry(sourceKey),
      onLibraryRename: (sourceKey, displayName) => renameLibraryEntry(sourceKey, displayName),
      onLibraryRenameGroup: (groupId, name) => renameLibraryGroup(groupId, name),
      onLibraryDeleteGroup: (groupId) => deleteLibraryGroup(groupId),
      fileManager: {
        listTargets: () => listFmTargets(),
        listDir: (target, path) => fmListDir(target, path),
        readFile: (target, path) => fmReadFile(target, path),
        writeFile: (target, path, data) => fmWriteFile(target, path, data),
        deleteFile: (target, path) => fmDeleteFile(target, path),
        makeDir: (target, path) => fmMakeDir(target, path),
        createTransferFd: (desiredName) => fmCreateTransferFd(desiredName),
      },
    },
    { offerFreeDosChoice: !diskSpecified, trackingEnabled: params.get('mousetrack') !== '0' },
  );
  if (perfParam) {
    void import('./ui/perf.ts').then(({ startPerfOverlay }) => {
      const stage = ui.canvas.parentElement;
      if (stage) startPerfOverlay(stage);
    });
  }
  np2 = new WebNP2(ui.canvas);
  np2.on('log', ({ level, message }) => {
    if (level === 'error') console.error('[WebNP2]', message);
    else console.log('[WebNP2]', message);
  });
  np2.on('fdChanged', () => {
    updateFdSlotsUI();
    updatePasteFeature();
  });
  np2.on('booted', () => {
    updatePasteFeature();
    startPasteFeaturePolling();
    // AudioWorklet低遅延音声出力へ切り替える(非対応環境は従来のSDL経路のまま)。
    if (workletEnabled) {
      void startWorkletAudio(alatParam).then((ok) => {
        console.log(`[WebNP2] audio output: ${ok ? 'AudioWorklet' : 'SDL (fallback)'}`);
        checkAudioMuted();
      });
    }
  });
  np2.on('stateSaved', () => setStatusT('statusStateSaved'));
  np2.on('stateLoaded', () => setStatusT('statusStateLoaded'));
  if (bridgeUrl) {
    np2.on('booted', () => {
      const bridge = new Bridge(np2, ui.canvas);
      bridge.connect(bridgeUrl);
    });
  }
  // ページ内JSからの自動操作用デバッグAPI(WebPaint98等)。Bridgeのコマンド群を
  // WebSocketなしで直接呼べる。例: await window.np2debug.call('screenshot')
  {
    const debugBridge = new Bridge(np2, ui.canvas);
    (window as unknown as { np2debug: unknown }).np2debug = {
      call: (cmd: string, args?: Record<string, unknown>) => debugBridge.exec(cmd, args),
      np2,
    };
  }
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
