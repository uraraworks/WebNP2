// WebNP2のデバッガwasm APIを、実ブラウザ上のWebNP2クラス経由で検証する。
// Viteが未起動ならこのスクリプト自身で起動し、一時Chromeプロファイルは終了時に削除する。

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_URL = process.env.WEBNP2_URL ?? 'http://127.0.0.1:5173';
const STATIC_URL = 'http://webnp2-smoke.local';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIAGNOSTICS = process.env.PC98_DBG_DIAG === '1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let serverOutput = '';
let profile;
let browser;
let page;
let staticFallback = false;
const results = [];

async function runCommand(command, args) {
  const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) throw new Error(output.trim());
}

async function urlReady() {
  try {
    const response = await fetch(BASE_URL);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await urlReady()) return;
  if (process.env.WEBNP2_URL) {
    throw new Error(`WEBNP2_URLへ接続できません: ${BASE_URL}`);
  }

  server = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await urlReady()) return;
    if (server.exitCode !== null) break;
    await sleep(200);
  }
  if (serverOutput.includes('listen EPERM')) {
    // Codex等のlocal bind禁止sandboxでも、実Chrome上の同じdist成果物を検証できるようにする。
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
    staticFallback = true;
    return;
  }
  throw new Error(`Viteの起動に失敗しました: ${serverOutput.trim()}`);
}

/** dist以下をPuppeteerのrequest interceptionで返す。HTTP listenを許可しない環境専用。 */
async function enableStaticFallback(targetPage) {
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.wasm': 'application/wasm',
    '.bmp': 'image/bmp',
    '.xdf': 'application/octet-stream',
  };
  await targetPage.setRequestInterception(true);
  targetPage.on('request', async (request) => {
    const url = new URL(request.url());
    if (url.origin !== STATIC_URL) {
      await request.abort();
      return;
    }
    const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (relative.split('/').includes('..')) {
      await request.respond({ status: 403, body: 'forbidden' });
      return;
    }
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
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[FAIL] ${number}. ${name}: ${message}`);
  }
}

function requirePage() {
  if (!page) throw new Error('ブラウザページが未初期化です');
  return page;
}

function assertRegisters(regs) {
  const names = [
    'eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi', 'eip',
    'eflags', 'cs', 'ds', 'es', 'ss', 'fs', 'gs', 'cr0',
  ];
  assert.deepEqual(Object.keys(regs), names);
  for (const name of names) {
    assert.equal(Number.isInteger(regs[name]), true, `${name}が整数ではありません`);
  }
}

async function run() {
  let regs1;
  let regs2;
  let disasm1;
  let regsBeforeDisasm;
  let regsAfterDisasm;
  let resumeRegs;

  await check(1, 'Vite・Chrome・エミュレータ起動', async () => {
    await ensureServer();
    profile = await mkdtemp(join(tmpdir(), 'webnp2-dbg-'));
    browser = await puppeteer.launch({
      executablePath: CHROME,
      userDataDir: profile,
      headless: 'new',
      args: ['--hide-scrollbars', '--force-device-scale-factor=2'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 2 });
    if (staticFallback) await enableStaticFallback(page);
    const pageUrl = staticFallback ? STATIC_URL : BASE_URL;
    await page.goto(`${pageUrl}/?freedos=1&run=1&worklet=0&lang=ja`, {
      waitUntil: 'networkidle2',
    });
    await page.waitForFunction(() => window.np2debug?.np2?.isBooted?.() === true, {
      timeout: 120_000,
    });
    await sleep(5_000);
  });

  await check(2, '一時停止状態', async () => {
    const paused = await requirePage().evaluate(() => {
      const np2 = window.np2debug.np2;
      np2.dbgSetPaused(true);
      return np2.dbgIsPaused();
    });
    assert.equal(paused, true);
  });

  await check(3, 'レジスタ読み出し', async () => {
    regs1 = await requirePage().evaluate(() => window.np2debug.np2.dbgReadRegs());
    assertRegisters(regs1);
  });

  await check(4, '1命令ステップとEIP更新', async () => {
    assert.ok(regs1, 'regs1がありません');
    const result = await requirePage().evaluate(() => {
      const np2 = window.np2debug.np2;
      return { executed: np2.dbgStep(1), regs: np2.dbgReadRegs() };
    });
    regs2 = result.regs;
    assert.equal(result.executed, 1);
    assert.notEqual(regs2.eip, regs1.eip);
  });

  await check(5, '逆アセンブル5行・命令長・アドレス積算', async () => {
    assert.ok(regs1, 'regs1がありません');
    disasm1 = await requirePage().evaluate(
      ({ cs, eip }) => window.np2debug.np2.dbgDisasm(cs, eip, 5),
      regs1,
    );
    assert.equal(disasm1.length, 5);
    let expected = regs1.eip >>> 0;
    for (const line of disasm1) {
      assert.equal(line.addr, expected);
      assert.ok(line.len >= 1 && line.len <= 15, `命令長が範囲外です: ${line.len}`);
      assert.equal(line.bytes.length, line.len);
      expected = (expected + line.len) >>> 0;
    }

    // BIOS既知列 E800:0034 = F4(hlt), EB FD(jmp short 0034) で
    // opcodeだけでなく命令長・オペランドまで解析できていることを固定値検証する。
    const known = await requirePage().evaluate(() =>
      window.np2debug.np2.dbgDisasm(0xe800, 0x34, 2),
    );
    assert.deepEqual(known[0], { addr: 0x34, len: 1, bytes: [0xf4], text: 'hlt' });
    assert.deepEqual(known[1], {
      addr: 0x35,
      len: 2,
      bytes: [0xeb, 0xfd],
      text: 'jmp 0034',
    });
  });

  await check(6, '逆アセンブル前後のCPU状態保持', async () => {
    const result = await requirePage().evaluate(() => {
      const np2 = window.np2debug.np2;
      const before = np2.dbgReadRegs();
      np2.dbgDisasm(before.cs, before.eip, 5);
      const after = np2.dbgReadRegs();
      return { before, after };
    });
    regsBeforeDisasm = result.before;
    regsAfterDisasm = result.after;
    assert.deepEqual(regsAfterDisasm, regsBeforeDisasm);
  });

  await check(7, 'ソフトウェアブレークポイント到達', async () => {
    assert.ok(regsAfterDisasm, '逆アセンブル後のレジスタがありません');
    const result = await requirePage().evaluate(() => {
      const np2 = window.np2debug.np2;
      // まずBPを全て無効にした1ステップ実行で、run_until_bp自身が進むかを確認する。
      np2.dbgSetBreakpoint(0, 0, 0, false);
      const probeBefore = np2.dbgReadRegs();
      const probeHit = np2.dbgRunUntilBreakpoint(1);
      const probeAfter = np2.dbgReadRegs();

      const current = probeAfter;
      const lines = np2.dbgDisasm(current.cs, current.eip, 5);
      const target = lines[2].addr;
      np2.dbgSetBreakpoint(0, current.cs, target, true);
      const hit = np2.dbgRunUntilBreakpoint(1000);
      const stopped = np2.dbgReadRegs();
      np2.dbgSetBreakpoint(0, current.cs, target, false);
      return { probeBefore, probeHit, probeAfter, current, lines, hit, target, stopped };
    });
    if (DIAGNOSTICS) console.log(`[DIAG] breakpoint: ${JSON.stringify(result)}`);
    assert.equal(result.probeHit, -1);
    assert.notDeepEqual(result.probeAfter, result.probeBefore);
    assert.equal(result.hit, 0);
    assert.equal(result.stopped.eip, result.target);
  });

  await check(8, '通常実行への復帰', async () => {
    const before = await requirePage().evaluate(() => {
      const np2 = window.np2debug.np2;
      const regs = np2.dbgReadRegs();
      np2.dbgSetPaused(false);
      return regs;
    });
    await sleep(1_000);
    const result = await requirePage().evaluate(() => {
      const np2 = window.np2debug.np2;
      return { paused: np2.dbgIsPaused(), regs: np2.dbgReadRegs() };
    });
    resumeRegs = result.regs;
    assert.equal(result.paused, false);
    assert.notEqual(resumeRegs.eip, before.eip);
  });

  await check(9, '全チェック総合判定', async () => {
    assert.equal(results.slice(0, 8).every(Boolean), true);
  });
}

try {
  await run();
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
  }
}

if (!results.every(Boolean)) process.exitCode = 1;
