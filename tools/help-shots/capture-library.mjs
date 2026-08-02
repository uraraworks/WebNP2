// help.html 用スクリーンショット撮影: ディスクライブラリ (ja/en)。
// 使い方: dev サーバー起動中に `node tools/help-shots/capture-library.mjs [baseURL]`
//   既定 baseURL = http://localhost:5273
// 出力: public/help/library.png / library-en.png            (フォルダを展開したライブラリダイアログ)
//       public/help/library-menu.png / library-menu-en.png  (FDDスロットの「ライブラリから挿入」メニュー)
// 前提: システムの Google Chrome を headless 起動する (puppeteer-core は devDependencies)。
// 実物のディスクを用意せずに済むよう、ダミーのイメージをIndexedDBへ直接シードする
// (一覧は拡張子とメタ情報だけで描画されるため、中身は空バイト列で問題ない)。

import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5273';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/help');

// 撮影用のダミーライブラリ。日付が毎回変わらないよう savedAt は固定値にする。
const SEED_BASE = Date.UTC(2026, 6, 1, 12, 0, 0);
const GROUP_ID = 'arc:DUNGEON.zip:1441792';

const LANGS = [
  {
    lang: 'ja',
    dialogFile: 'library.png',
    menuFile: 'library-menu.png',
    libraryBtnTitle: 'ディスクライブラリ',
    menuBtnTitle: 'ライブラリから挿入',
  },
  {
    lang: 'en',
    dialogFile: 'library-en.png',
    menuFile: 'library-menu-en.png',
    libraryBtnTitle: 'Disk Library',
    menuBtnTitle: 'Insert from library',
  },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

  for (const { lang, dialogFile, menuFile, libraryBtnTitle, menuBtnTitle } of LANGS) {
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    // 言語設定 + ダミーのディスクライブラリをシードしてからリロードする。
    await page.evaluate(
      async (l, seedBase, groupId) => {
        localStorage.setItem('webnp2.lang', l);
        const records = [
          { key: `${groupId}/DISK1.d88`, name: 'DISK1.d88', size: 1_261_568, group: 0 },
          { key: `${groupId}/DISK2.d88`, name: 'DISK2.d88', size: 1_261_568, group: 1 },
          { key: `${groupId}/DISK3.d88`, name: 'DISK3.d88', size: 1_261_568, group: 2 },
        ];
        await new Promise((resolve, reject) => {
          const req = indexedDB.open('webnp2', 1);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains('images')) {
              req.result.createObjectStore('images', { keyPath: 'sourceKey' });
            }
          };
          req.onsuccess = () => {
            const tx = req.result.transaction('images', 'readwrite');
            const store = tx.objectStore('images');
            // 既存データを消してから入れ直し、撮影内容を毎回同じにする。
            store.clear();
            for (const r of records) {
              store.put({
                sourceKey: r.key,
                name: r.name,
                bytes: new ArrayBuffer(r.size),
                savedAt: seedBase + r.group * 1000,
                group: groupId,
                groupName: 'DUNGEON.zip',
                groupIndex: r.group,
              });
            }
            store.put({
              sourceKey: 'help-shot:msdos',
              name: 'MSDOS62.xdf',
              bytes: new ArrayBuffer(1_261_568),
              savedAt: seedBase - 3_600_000,
            });
            store.put({
              sourceKey: 'help-shot:hdd',
              name: 'GAMES.thd',
              bytes: new ArrayBuffer(41_943_040),
              savedAt: seedBase - 7_200_000,
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
      },
      lang,
      SEED_BASE,
      GROUP_ID,
    );
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    // (1) ライブラリダイアログ: フォルダを展開した状態で撮る。
    await page.waitForSelector(`.icon-btn[title="${libraryBtnTitle}"]`);
    await page.click(`.icon-btn[title="${libraryBtnTitle}"]`);
    await page.waitForSelector('.library-list-group');
    await page.click('.library-list-group');
    await page.waitForSelector('.library-list-item.in-group');

    // クリック直後のカーソル位置でボタンがホバー表示になるため、外へ逃がしてから撮る。
    await page.mouse.move(0, 0);
    const modal = await page.$('.rom-modal-backdrop:not(.hidden) .rom-modal');
    await modal.screenshot({ path: path.join(OUT_DIR, dialogFile) });
    console.log(`captured: ${dialogFile}`);

    // (2) FDDスロットの「ライブラリから挿入」メニュー: フォルダの中身(サブメニュー)を撮る。
    // ROM登録ダイアログも同じ .rom-close-btn を使うため、表示中のダイアログ内から探す。
    await page.evaluate(() => {
      document.querySelector('.rom-modal-backdrop:not(.hidden) .rom-close-btn').click();
    });
    await page.waitForSelector('.rom-modal-backdrop:not(.hidden)', { hidden: true });
    await page.waitForSelector(`.fd-slot .icon-btn[title="${menuBtnTitle}"]`);
    await page.click(`.fd-slot .icon-btn[title="${menuBtnTitle}"]`);
    await page.waitForSelector('.library-menu:not(.hidden) .library-menu-item.group');
    await page.click('.library-menu-item.group');
    await page.waitForSelector('.library-menu-item.back');

    await page.mouse.move(0, 0);
    const menu = await page.$('.library-menu');
    await menu.screenshot({ path: path.join(OUT_DIR, menuFile) });
    console.log(`captured: ${menuFile}`);
  }
} finally {
  await browser.close();
}
