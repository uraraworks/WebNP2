import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { computeVersion } from '../../tools/compute-version.mjs';

// src/version.ts が参照する __WEBNP2_VERSION_FOOTER__ / __WEBNP2_BUILD_ID__ は
// ルートの vite.config.ts の define で埋め込まれる定数。このembedパッケージのビルドは
// 別のvite設定(このファイル)を使うため、ここでも同じ define を持たせないと
// バンドルに未置換のグローバル識別子が残り、実行時に ReferenceError で落ちる。
//
// これは version.ts を導入した 804f2d0(2026-08-16) で embed 側の define を
// 足し忘れていた潜伏バグ。WorkbenchNP2 が抱えていた vendor 済みバンドルは
// 2026-08-08 のビルド、つまり version.ts 導入より前のものだったため影響を
// 受けておらず(2026-08-28に旧バンドルのimportが通ることを確認済み)、
// 2026-08-28 に embed を再ビルドして初めて表面化した。
// 派生物を作り直すまで露見しない種類の不具合なので、ルート側の define を
// 増やしたときはこのファイルにも同じものを足すこと。
const { footer, buildId } = computeVersion();

export default defineConfig({
  define: {
    __WEBNP2_VERSION_FOOTER__: JSON.stringify(footer),
    __WEBNP2_BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/library.ts'),
      formats: ['es'],
      fileName: () => 'webnp2-embed.js',
    },
  },
});
