// help.html 用スクリーンショット撮影: ファイル転送ダイアログ (ja/en)。
// 使い方: dev サーバー起動中に `node tools/help-shots/capture-filemanager.mjs [baseURL]`
//   既定 baseURL = http://localhost:5273
// 出力: public/help/filemanager.png / filemanager-en.png (deviceScaleFactor=2 のダイアログ切り抜き)
// 前提: システムの Google Chrome を headless 起動する (puppeteer-core は devDependencies)。
// 右ペインに中身を写すため、同梱ツールFD(/tools/webnp2tools.xdf)をIndexedDBへシードして
// ライブラリ経由で選択する。

import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5273';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/help');

const LANGS = [
  { lang: 'ja', file: 'filemanager.png', btnTitle: 'ファイル転送' },
  { lang: 'en', file: 'filemanager-en.png', btnTitle: 'File Transfer' },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

  for (const { lang, file, btnTitle } of LANGS) {
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    // 言語設定 + ライブラリへツールFDをシードしてからリロード(起動時に一覧へ反映させる)
    await page.evaluate(async (l) => {
      localStorage.setItem('webnp2.lang', l);
      const res = await fetch('./tools/webnp2tools.xdf');
      const bytes = await res.arrayBuffer();
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('webnp2', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('images')) {
            req.result.createObjectStore('images', { keyPath: 'sourceKey' });
          }
        };
        req.onsuccess = () => {
          const tx = req.result.transaction('images', 'readwrite');
          tx.objectStore('images').put({
            sourceKey: 'help-shot:webnp2tools',
            name: 'webnp2tools.xdf',
            bytes,
            savedAt: Date.now(),
          });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    }, lang);
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    // ダイアログを開き、ライブラリのツールFDを選択してファイル一覧を表示させる
    await page.waitForSelector(`.icon-btn[title="${btnTitle}"]`);
    await page.click(`.icon-btn[title="${btnTitle}"]`);
    await page.waitForSelector('.fm-modal-backdrop:not(.hidden)');
    await page.evaluate(() => {
      const sel = document.querySelector('.fm-modal select');
      const opt = [...sel.options].find((o) => o.textContent.includes('webnp2tools.xdf'));
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // ファイル一覧の行が描画されるまで待つ
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.fm-modal *')].some((e) => e.textContent === 'PASTE.COM'),
    );

    const modal = await page.$('.fm-modal');
    await modal.screenshot({ path: path.join(OUT_DIR, file) });
    console.log(`captured: ${file}`);
  }
} finally {
  await browser.close();
}
