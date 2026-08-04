# @webnp2/embed

WebNP2をIDE等へ埋め込むためのESMライブラリ。npm publishは行わず、`dist/`を利用側へ同期する。

```sh
npm run build:embed
```

成果物は `dist/webnp2-embed.js`（ESM）、`dist/style.css`、`dist/types/`（型定義）。利用側では
ESMに加えて、UI部品を使う場合だけ `style.css` も読み込む。

公開APIは `src/index.ts` に限定する。

- エンジン: `createWebNP2(canvas)`、`WebNP2Engine`。起動、実行中のFD挿抜、リセット、
  状態保存/復元。HDDはコアの制約により起動オプションでのみ指定する。
- デバッグ: `createDebugger` / `DebuggerController`、レジスタ・逆アセンブル・メモリ・BP操作、
  `onPause` / `onBreakpoint`。
- UI部品: `mountDebuggerToolbar`、`mountRegisterView`、`mountDisassemblyView`、
  `mountMemoryDump`。文言は引数で渡し、WebNP2本体のi18nには依存しない。

```ts
import { createDebugger, createWebNP2, mountDebuggerToolbar } from '@webnp2/embed';
import '@webnp2/embed/style.css';

const engine = createWebNP2(document.querySelector('canvas')!);
await engine.boot({ fd1: { file: bootDisk, sourceKey: 'ide:boot' } });
const debug = createDebugger(engine);
debug.onPause(({ paused }) => console.log({ paused }));
debug.onBreakpoint(({ index, registers }) => console.log(index, registers.eip));

mountDebuggerToolbar(document.querySelector('#toolbar')!, {
  // 文言と操作はホスト側が注入する。
  labels: { pause: 'Pause', resume: 'Resume', step: 'Step', step10: 'Step ×10',
    runToBreakpoint: 'Run to BP', close: 'Close' },
  onPauseToggle: () => debug.setPaused(!debug.isPaused()),
  onStep: (count) => debug.step(count),
  onRunToBreakpoint: () => debug.runUntilBreakpoint(100_000),
  onClose: () => {},
});
```

NP2kai SDL2コアは非MODULARIZE形式でグローバル `window.Module` とcanvasを保持するため、
**1ページにつき1インスタンスのみ**対応する。利用側はWebNP2と同じ配置で`core/`のwasm・JS・fontを
配信する必要がある。別タブ・別ウィンドウ・iframeは別realmなので、それぞれ1台ずつ独立して動く。
Bridge、プレイヤー画面、WebNP2固有i18n、ディスクライブラリUIは公開しない。
