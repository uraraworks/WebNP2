// public/help/*.png (使い方ページの説明用スクリーンショット) を撮り直すスクリプト。
//
//   npm run dev            # 別ターミナルで開発サーバーを起動しておく
//   node scripts/capture-help-shots.mjs
//
// 実イメージは同梱できないため、ライブラリ表示用のサンプルは
// すべてこのスクリプト内で生成したダミーを IndexedDB へ直接書き込む。
// 撮影用プロファイルは毎回捨てるので、手元のブラウザ環境には影響しない。

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.WEBNP2_URL ?? 'http://localhost:5173';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = new URL('../public/help/', import.meta.url).pathname;

/** 既存のスクリーンショットと同じ寸法になるビューポート(いずれも2倍解像度で保存する)。 */
const VIEWPORT = { width: 900, height: 700, deviceScaleFactor: 2 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ライブラリ一覧用のサンプルレコード。
 * 一覧表示に使うのは名前とサイズと日時だけなので中身は空で足りるが、
 * ファイル転送ダイアログから開く可能性のあるFDだけは同梱FreeDOSの実イメージを使う
 * (空バッファのままだとBPBが不正で一覧取得に失敗してしまうため)。
 */
function sampleLibraryRecords() {
  const at = (iso) => new Date(iso).getTime();
  const blob = (size) => new ArrayBuffer(size);
  const FD = 1261568;
  return [
    {
      sourceKey: 'file:DISK1.d88:1',
      name: 'DISK1.d88',
      bytes: blob(FD),
      savedAt: at('2026-07-01T21:00:00'),
      group: 'g1',
      groupName: 'DUNGEON.zip',
      groupIndex: 0,
    },
    {
      sourceKey: 'file:DISK2.d88:2',
      name: 'DISK2.d88',
      bytes: blob(FD),
      savedAt: at('2026-07-01T21:00:01'),
      group: 'g1',
      groupName: 'DUNGEON.zip',
      groupIndex: 1,
    },
    {
      sourceKey: 'file:DISK3.d88:3',
      name: 'DISK3.d88',
      bytes: blob(FD),
      savedAt: at('2026-07-01T21:00:02'),
      group: 'g1',
      groupName: 'DUNGEON.zip',
      groupIndex: 2,
    },
    {
      sourceKey: 'file:MSDOS62.xdf:4',
      name: 'MSDOS62.xdf',
      bytes: blob(FD),
      savedAt: at('2026-07-01T20:00:00'),
      // 実FAT12イメージ(同梱FreeDOS)を中身として使う。
      fetchFrom: '/freedos/fd98_2hd.xdf',
    },
  ];
}

async function seedLibrary(page, records) {
  await page.evaluate(
    async (items) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('webnp2');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const prepared = [];
      for (const item of items) {
        const bytes = item.fetchFrom
          ? await (await fetch(item.fetchFrom)).arrayBuffer()
          : new ArrayBuffer(item.byteLength);
        const { fetchFrom, byteLength, ...rest } = item;
        prepared.push({ ...rest, bytes });
      }
      await new Promise((res, rej) => {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        for (const item of prepared) store.put(item);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    },
    records.map((r) => ({ ...r, bytes: undefined, byteLength: r.bytes.byteLength })),
  );
}

async function clearLibrary(page) {
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('webnp2');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (!db.objectStoreNames.contains('images')) return;
    await new Promise((res, rej) => {
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').clear();
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  });
}

/**
 * 起動前の「ブランクHDDを作成」ボタンで実際のFAT16イメージを作り、
 * 説明用の名前(GAMES.thd)と日時に付け替えてライブラリへ入れ直す。
 * ダミーのバイト列だとファイル転送ダイアログが一覧取得に失敗してしまうため、
 * サンプルのHDDは実物を使う。一覧は savedAt の降順なので、HDD行の
 * 「HDDにセット」ボタンが見えるよう最新の日時にしておく。
 */
async function createSampleHdd(page) {
  await page.evaluate(() => {
    const slot = document.querySelectorAll('.fd-slot')[2];
    const btn = Array.from(slot.querySelectorAll('button')).find(
      (b) => b.title.includes('ブランク') || b.title.includes('blank'),
    );
    btn.click();
  });
  await sleep(2500);
  await page.evaluate(async (savedAt) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('webnp2');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all = await new Promise((res, rej) => {
      const tx = db.transaction('images');
      const q = tx.objectStore('images').getAll();
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const blank = all.find((r) => r.name === 'blank.thd');
    await new Promise((res, rej) => {
      const tx = db.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      store.delete(blank.sourceKey);
      store.put({
        ...blank,
        sourceKey: 'file:GAMES.thd:' + blank.bytes.byteLength,
        name: 'GAMES.thd',
      });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  });
}

/**
 * サンプルHDDの保存日時を固定値にする。
 * ファイル転送で中身を書き込むと savedAt が現在時刻に更新されてしまうため、
 * 中身を入れ終えたあとに撮影用の日時へ付け替える。
 */
async function stampSampleHddDate(page) {
  await page.evaluate(async (savedAt) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('webnp2');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all = await new Promise((res, rej) => {
      const tx = db.transaction('images');
      const q = tx.objectStore('images').getAll();
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const hdd = all.find((r) => r.name === 'GAMES.thd');
    await new Promise((res, rej) => {
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').put({ ...hdd, savedAt });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }, new Date('2026-07-01T22:00:00').getTime());
}

/** ディスクライブラリのアーカイブ由来フォルダ行を開く(中身が見えている状態で撮るため)。 */
async function expandLibraryGroup(page) {
  await page.evaluate(() => {
    const row = document.querySelector('.library-list-group');
    if (row && row.getAttribute('aria-expanded') !== 'true') row.click();
  });
  await sleep(500);
}

/** サンプルHDDに、一覧が空にならない程度の中身を書き込む。 */
async function seedHddContents(page) {
  await page.evaluate(async () => {
    const np2 = window.np2debug.np2;
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('webnp2');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const keys = await new Promise((res, rej) => {
      const tx = db.transaction('images');
      const q = tx.objectStore('images').getAllKeys();
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const key = keys.find((k) => k.includes('GAMES.thd'));
    await np2.libraryMakeDir(key, 'GAME');
    await np2.libraryMakeDir(key, 'TOOLS');
    await np2.libraryWriteFile(key, 'README.TXT', new Uint8Array(1024));
  });
  await sleep(600);
}

/** ファイル転送ダイアログの対象セレクタを名前で選び直す。 */
async function selectFmTarget(page, namePart) {
  await page.evaluate((needle) => {
    const select = document.querySelector('.fm-modal select');
    const option = Array.from(select.options).find((o) => o.textContent.includes(needle));
    if (!option) throw new Error(`fm target not found: ${needle}`);
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, namePart);
}

async function shoot(page, selector, file) {
  const el = await page.$(selector);
  if (!el) throw new Error(`element not found: ${selector} (for ${file})`);
  await el.screenshot({ path: join(OUT_DIR, file) });
  console.log(`  wrote ${file}`);
}

/** ダイアログのうち、見出しテキストで対象を絞り込むためのセレクタ解決。 */
async function modalContaining(page, text) {
  const handle = await page.evaluateHandle((needle) => {
    const modals = Array.from(document.querySelectorAll('.rom-modal'));
    return modals.find(
      (m) => !m.closest('.hidden') && m.textContent.includes(needle),
    );
  }, text);
  const el = handle.asElement();
  if (!el) throw new Error(`modal not found: ${text}`);
  return el;
}

async function clickToolbarButton(page, titlePart) {
  await page.evaluate((needle) => {
    const btn = Array.from(document.querySelectorAll('.toolbar button, .toolbar a')).find((b) =>
      (b.title ?? '').includes(needle),
    );
    if (!btn) throw new Error(`toolbar button not found: ${needle}`);
    btn.click();
  }, titlePart);
  await sleep(600);
}

async function run() {
  const profile = await mkdtemp(join(tmpdir(), 'webnp2-shots-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    userDataDir: profile,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-device-scale-factor=2'],
  });

  try {
    for (const lang of ['ja', 'en']) {
      const suffix = lang === 'ja' ? '' : '-en';
      console.log(`[${lang}]`);
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);

      // --- overlay: 起動前オーバーレイ(ライブラリ空 = 「保存済みディスクから起動」なし) ---
      await page.goto(`${BASE_URL}/?lang=${lang}`, { waitUntil: 'networkidle2' });
      await clearLibrary(page);
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(1200);
      await shoot(page, '.console-card', `overlay${suffix}.png`);

      // --- library: サンプル入りのディスクライブラリ(アーカイブのフォルダを開いた状態) ---
      await createSampleHdd(page);
      await seedLibrary(page, sampleLibraryRecords());
      await seedHddContents(page);
      await stampSampleHddDate(page);
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(1200);
      await clickToolbarButton(page, lang === 'ja' ? 'ディスクライブラリ' : 'Disk Library');
      await sleep(800);
      await expandLibraryGroup(page);
      const libraryModal = await modalContaining(page, lang === 'ja' ? 'ディスクライブラリ' : 'Disk Library');
      await libraryModal.screenshot({ path: join(OUT_DIR, `library${suffix}.png`) });
      console.log(`  wrote library${suffix}.png`);

      // --- filemanager: 起動前のHDDイメージを対象にしたファイル転送ダイアログ ---
      await page.keyboard.press('Escape');
      await sleep(400);
      await clickToolbarButton(page, lang === 'ja' ? 'ファイル転送' : 'File Transfer');
      await sleep(800);
      await selectFmTarget(page, 'GAMES.thd');
      await sleep(1200);
      const fmModal = await page.$('.fm-modal');
      await fmModal.screenshot({ path: join(OUT_DIR, `filemanager${suffix}.png`) });
      console.log(`  wrote filemanager${suffix}.png`);

      // --- overview: FreeDOS(98)で起動した実行中の画面 ---
      await page.keyboard.press('Escape');
      await sleep(400);
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(1200);
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('.start-btn')).find((b) =>
          b.textContent.includes('FreeDOS'),
        );
        btn.click();
      });
      // FreeDOS(98)の起動完了(コマンドプロンプト表示)まで待つ。
      await page.waitForFunction(() => window.np2debug?.np2?.isBooted?.() === true, {
        timeout: 120000,
      });
      await sleep(30000);
      await shoot(page, '.console-card', `overview${suffix}.png`);

      await clearLibrary(page);
      await page.close();
    }
  } finally {
    await browser.close();
    await rm(profile, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
