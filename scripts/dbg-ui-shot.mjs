// デバッガUIの実ブラウザ疎通・DOM検証と、デスクトップ/モバイル幅の資料画像を生成する。

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_URL = process.env.WEBNP2_URL ?? 'http://127.0.0.1:5173';
const STATIC_URL = 'http://webnp2-debugger-ui.local';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_DIR =
  '/private/tmp/claude-501/-Users-haruurara-MyProject--emulator-PC98/ebf3c7ad-2505-4d39-9ee7-ff750b61b82a/scratchpad';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let serverOutput = '';
let profile;
let browser;
let page;
let mobilePage;
let staticFallback = false;
const results = [];

async function runCommand(command, args) {
  const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) throw new Error(output.trim());
}

async function urlReady() {
  try {
    return (await fetch(BASE_URL)).ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await urlReady()) return;
  if (process.env.WEBNP2_URL) throw new Error(`WEBNP2_URLへ接続できません: ${BASE_URL}`);
  server = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await urlReady()) return;
    if (server.exitCode !== null) break;
    await sleep(200);
  }
  if (serverOutput.includes('listen EPERM')) {
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
    staticFallback = true;
    return;
  }
  throw new Error(`Viteの起動に失敗しました: ${serverOutput.trim()}`);
}

async function enableStaticFallback(targetPage) {
  const contentTypes = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
    '.bmp': 'image/bmp', '.xdf': 'application/octet-stream',
  };
  await targetPage.setRequestInterception(true);
  targetPage.on('request', async (request) => {
    const url = new URL(request.url());
    if (url.origin !== STATIC_URL) { await request.abort(); return; }
    const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (relative.split('/').includes('..')) { await request.respond({ status: 403, body: 'forbidden' }); return; }
    try {
      const body = await readFile(join(ROOT, 'dist', relative));
      const extension = relative.slice(relative.lastIndexOf('.'));
      await request.respond({
        status: 200,
        contentType: contentTypes[extension] ?? 'application/octet-stream',
        body,
      });
    } catch {
      await request.respond({ status: 404, body: 'not found' });
    }
  });
}

async function check(number, name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`[PASS] ${number}. ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`[FAIL] ${number}. ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function openEmulatorPage(viewport) {
  const target = await browser.newPage();
  // isMobileはページ遷移前に確定する。起動後の切替は再読込を起こすため禁止する。
  await target.setViewport(viewport);
  if (staticFallback) await enableStaticFallback(target);
  const pageUrl = staticFallback ? STATIC_URL : BASE_URL;
  await target.goto(`${pageUrl}/?freedos=1&run=1&worklet=0&lang=ja`, { waitUntil: 'networkidle2' });
  await target.waitForFunction(() => window.np2debug?.np2?.isBooted?.() === true, { timeout: 120_000 });
  await target.waitForSelector('[data-debugger-open]:not(:disabled)', { timeout: 30_000 });
  await target.waitForFunction(() => window.np2debug.np2.getScreenText().text.trim().length > 0, {
    timeout: 30_000,
  });
  await sleep(2_000);
  return target;
}

function intersectsViewport(rect, width, height) {
  return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
    && rect.left < width && rect.top < height;
}

async function run() {
  await check(1, 'Vite・Chrome・FreeDOS(98)起動', async () => {
    await ensureServer();
    profile = await mkdtemp(join(tmpdir(), 'webnp2-dbg-ui-'));
    browser = await puppeteer.launch({
      executablePath: CHROME,
      userDataDir: profile,
      headless: 'new',
      args: ['--hide-scrollbars'],
    });
    page = await openEmulatorPage({ width: 1180, height: 900, deviceScaleFactor: 1 });
  });

  await check(2, '右ドックで画面を併記しPause・複数Step', async () => {
    await page.click('[data-debugger-open]');
    await page.waitForSelector('.debugger-backdrop:not(.hidden)');
    await page.click('[data-debugger-pause]');
    assert.equal(await page.evaluate(() => window.np2debug.np2.dbgIsPaused()), true);
    for (let i = 0; i < 3; i++) await page.click('[data-debugger-step]');
    const disabled = await page.$eval('[data-debugger-step]', (node) => node.disabled);
    assert.equal(disabled, false);
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector('#canvas').getBoundingClientRect();
      const panel = document.querySelector('.debugger-modal').getBoundingClientRect();
      const style = getComputedStyle(document.querySelector('.debugger-backdrop'));
      return {
        canvas: { left: canvas.left, top: canvas.top, right: canvas.right, bottom: canvas.bottom, width: canvas.width, height: canvas.height },
        panel: { left: panel.left, top: panel.top, right: panel.right, bottom: panel.bottom, width: panel.width, height: panel.height },
        panelDisplay: style.display,
      };
    });
    assert.ok(intersectsViewport(layout.canvas, 1180, 900), 'エミュレータ画面が可視ではありません');
    assert.ok(intersectsViewport(layout.panel, 1180, 900), 'デバッガパネルが可視ではありません');
    assert.equal(layout.panelDisplay === 'none', false);
    const overlaps = layout.canvas.left < layout.panel.right && layout.canvas.right > layout.panel.left
      && layout.canvas.top < layout.panel.bottom && layout.canvas.bottom > layout.panel.top;
    assert.equal(overlaps, false, 'デバッガがエミュレータ画面を覆っています');
  });

  await check(3, 'レジスタ17行と変更強調', async () => {
    const count = await page.$$eval('[data-debugger-register]', (nodes) => nodes.length);
    assert.equal(count, 17);
    const changed = await page.$$eval('[data-debugger-register].changed', (nodes) => nodes.length);
    assert.ok(changed > 0, 'Step後に変更レジスタの強調がありません');
  });

  await check(4, '逆アセンブル25行と現在行強調', async () => {
    const lineCount = await page.$$eval('[data-debugger-disasm-row]', (nodes) => nodes.length);
    const currentCount = await page.$$eval('[data-debugger-disasm-row].current', (nodes) => nodes.length);
    assert.equal(lineCount, 25);
    assert.equal(currentCount, 1);
  });

  await check(5, 'ブレークポイント切替', async () => {
    const selector = '[data-debugger-disasm-row]:not(.current)';
    await page.click(selector);
    assert.equal(await page.$eval(selector, (node) => node.classList.contains('breakpoint')), true);
    assert.equal(await page.$eval(selector, (node) => node.querySelector('.debugger-bp-marker')?.textContent), '●');
    const runDisabled = await page.$eval('[data-debugger-run]', (node) => node.disabled);
    assert.equal(runDisabled, false);
  });

  await check(6, 'メモリダンプ内容とデスクトップ画像保存', async () => {
    await page.click('.debugger-memory-read');
    const memory = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.debugger-memory-row'));
      const first = rows[0];
      const hexNode = first?.querySelector('.debugger-memory-hex');
      return {
        count: rows.length,
        hex: hexNode?.textContent ?? '',
        ascii: first?.querySelector('.debugger-memory-ascii')?.textContent ?? '',
        hexWhiteSpace: hexNode ? getComputedStyle(hexNode).whiteSpace : '',
        hexHeight: hexNode?.getBoundingClientRect().height ?? 0,
        rowHeight: first?.getBoundingClientRect().height ?? 0,
      };
    });
    assert.equal(memory.count, 8);
    assert.equal(memory.hex.trim().split(/\s+/).length, 16);
    assert.equal(memory.ascii.length, 16);
    assert.equal(memory.hexWhiteSpace, 'pre');
    assert.ok(memory.hexHeight <= 18, `hex列が折り返しています: ${JSON.stringify(memory)}`);
    assert.ok(memory.rowHeight <= 20, `メモリ行が複数行へ崩れています: ${JSON.stringify(memory)}`);
    await page.$eval('.debugger-memory-dump', (node) => node.scrollIntoView({ block: 'nearest' }));
    const visible = await page.evaluate(() => {
      const copy = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
      };
      return {
        canvas: copy('#canvas'),
        memory: copy('.debugger-memory-row'),
        step: copy('[data-debugger-step]'),
        eax: copy('[data-debugger-register="eax"]'),
      };
    });
    assert.ok(visible.canvas && intersectsViewport(visible.canvas, 1180, 900), '撮影時にエミュレータ画面が見えません');
    assert.ok(visible.memory && intersectsViewport(visible.memory, 1180, 900), '撮影時にメモリダンプ結果が見えません');
    assert.ok(visible.step && intersectsViewport(visible.step, 1180, 900), 'Stepボタンが画面外です');
    assert.ok(visible.eax && intersectsViewport(visible.eax, 1180, 900), 'レジスタ上段が画面外です');
    await mkdir(SHOT_DIR, { recursive: true });
    const path = join(SHOT_DIR, 'webnp2-debugger-desktop.png');
    await page.screenshot({ path });
    console.log(`[SHOT] ${path}`);
  });

  await check(7, '375pxで起動済み画面・開いたパネル・主要要素を表示', async () => {
    mobilePage = await openEmulatorPage({
      width: 375, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    });
    const bootState = await mobilePage.evaluate(() => ({
      booted: window.np2debug.np2.isBooted(),
      screen: window.np2debug.np2.getScreenText().text.trim(),
    }));
    assert.equal(bootState.booted, true);
    assert.ok(bootState.screen.length > 0, 'FreeDOS画面テキストが空です');
    assert.equal(bootState.screen.includes('システムディスクをセットしてください'), false, 'BIOSのディスク待ち画面です');
    await mobilePage.click('[data-debugger-open]');
    await mobilePage.waitForSelector('.debugger-backdrop:not(.hidden)');
    await mobilePage.click('[data-debugger-pause]');
    await mobilePage.click('[data-debugger-step]');
    const state = await mobilePage.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector)?.getBoundingClientRect();
        return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
      };
      const modal = document.querySelector('.debugger-modal');
      if (modal) modal.scrollTop = 0;
      return {
        backdropDisplay: getComputedStyle(document.querySelector('.debugger-backdrop')).display,
        modal: rect('.debugger-modal'),
        pause: rect('[data-debugger-pause]'),
        step: rect('[data-debugger-step]'),
        run: rect('[data-debugger-run]'),
        register: rect('[data-debugger-register]'),
        disasm: rect('[data-debugger-disasm-row].current'),
        registerCount: document.querySelectorAll('[data-debugger-register]').length,
        disasmCount: document.querySelectorAll('[data-debugger-disasm-row]').length,
        scrollWidth: modal?.scrollWidth ?? 0,
        clientWidth: modal?.clientWidth ?? 0,
      };
    });
    assert.notEqual(state.backdropDisplay, 'none', 'モバイルでパネルが閉じています');
    assert.equal(state.registerCount, 17);
    assert.equal(state.disasmCount, 25);
    for (const [name, rect] of Object.entries({
      panel: state.modal, pause: state.pause, step: state.step, run: state.run,
      register: state.register, disasm: state.disasm,
    })) {
      assert.ok(rect && intersectsViewport(rect, 375, 800), `${name}がモバイル画面内で視認できません`);
    }
    assert.ok(state.scrollWidth <= state.clientWidth + 1, `横方向にはみ出しています: ${JSON.stringify(state)}`);
    const path = join(SHOT_DIR, 'webnp2-debugger-mobile.png');
    await mobilePage.screenshot({ path });
    console.log(`[SHOT] ${path}`);
  });

  await check(8, '全DOM・画像チェック総合判定', async () => {
    assert.equal(results.slice(0, 7).every(Boolean), true);
  });
}

try {
  await run();
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server && server.exitCode === null) server.kill('SIGTERM');
}

if (!results.every(Boolean)) process.exitCode = 1;
