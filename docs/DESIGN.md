# WebNP2 設計書

PC-98エミュレータ NP2kai (wasm) をブラウザで快適に使うための Web プレイヤー層。
「URL を開くだけで起動・プレイ・セーブ持ち越し」の体験を目指す。

- コア: [uraraworks/NP2kai-wasm](https://github.com/uraraworks/NP2kai-wasm) (`wasm` ブランチ) のビルド成果物
- 本リポジトリ: UI層・API層・永続化層・(将来)MCP連携の制御プレーン

## 1. 全体アーキテクチャ

```
┌─────────────────────────────────────────────┐
│ UI層 (src/ui)                                │
│  プレイヤー画面 / ツールバー / D&D / ダイアログ │
└──────────────┬──────────────────────────────┘
               │ CommandBus (型付きコマンド)
┌──────────────┴──────────────────────────────┐
│ API層 (src/api)  class WebNP2               │
│  boot / reset / insertDisk / keyInput /      │
│  screenshot / readTextVram(将来) ...          │
└──────┬───────────────────────┬───────────────┘
       │                       │
┌──────┴────────┐   ┌──────────┴────────────────┐
│ core層         │   │ storage層 (src/storage)    │
│ (src/core)     │   │  IndexedDB                 │
│ Emscripten     │   │  - 変更済みディスクイメージ  │
│ Module管理     │   │  - (将来)ステートセーブ      │
│ MEMFS注入      │   │  - 設定                     │
└──────┬────────┘   └───────────────────────────┘
       │
  public/core/  emnp21kai_sdl2.js / .wasm / font.bmp
  （NP2kai-wasm のビルド成果物を配置）
```

- **CommandBus が制御プレーン**。UI もここを叩くだけにする。
  将来の MCP 連携は「WebSocket サーバー → CommandBus」を足すだけで済む構造にする。
- API層は np2-wasm (irori) の TS API 層を参考にするが、コアは NP2kai なので互換は狙わない。

## 2. URL パラメータ仕様

```
https://.../?hdd=<URL>&fd1=<URL>&fd2=<URL>&clk=<倍率>&run=1
```

| パラメータ | 意味 | 備考 |
|---|---|---|
| `hdd` | HDDイメージのURL | T98(.thd)等 NP2kai対応形式 |
| `fd1` `fd2` | FDイメージのURL | NP2kai本体(`np2_isfdimage()`)準拠の形式(`.bin`除く)。.d88/.fdi 等 |
| `lib` | ディスクライブラリへ登録するだけのURL(複数指定可) | 種別チェックなし。常にライブラリを開き run=1 でも自動起動しない |
| `state` | (将来) ステートセーブのURL | |
| `run` | `1`で自動起動 | 無指定時はクリックで起動(音声制限対策) |
| `clk` | クロック設定 | 省略時デフォルト |
| `paste` | `1`=全角利用可として扱う / `0`=テキスト送信UIを完全非表示 | 省略時は起動後にボタン表示。全角可否はFreeDOS(98)マウント/TSR常駐で自動判定 |

- イメージ取得は `fetch`。**CORS 必須**（配布側に `Access-Control-Allow-Origin` が必要）。README に明記する。
- 取得中はプログレスバー表示。失敗時は理由（CORS/404）を分かる形で表示。
- **中継フォールバック**（`src/api/disk-fetch.ts`）: 直接 `fetch` が失敗した場合のみ、中継サービス
  （`VITE_DISK_PROXY`）経由で再取得を試みる。設計上の理由:
  - (a) 直接 `fetch` を先に試すのは、GitHub raw のように CORS 対応済みの配布元に無駄な中継を
    挟まないため。
  - (b) 中継先のURLをコードへ直書きせず環境変数 `VITE_DISK_PROXY` から注入するのは、この
    リポジトリをforkしたビルドが無断で他人のVPS（中継サーバ）を向いてしまわないようにする
    ため。公開ページ用ビルドのみ GitHub Actions のリポジトリ変数から注入される
    （`.github/workflows/deploy.yml` 参照）。
  - (c) OneDrive の共有リンクは実測で中継しても取得できないことが確認済みのため、中継を
    試さず即座に専用の案内（ダウンロードして画面へD&D）を出す。Google Drive は中継経由で
    取得可能。
  - (c-2) Dropbox の共有リンクはホスト名を `dl.dropboxusercontent.com` へ置換すると
    パス・クエリ（アクセス鍵 `rlkey` を含むのでそのまま保持する）そのままで CORS を通過し
    直接取得できる（2026-08-18 実測。`www.dropbox.com` のままだと `dl=0`/`dl=1` いずれも
    ACAO が無く失敗する。curl / Node の fetch は CORS を強制しないため、この判定は
    ブラウザでしか測れない）。そのため Dropbox は中継を必須とするホスト
    （`PROXY_ONLY_HOSTS`）から外し、置換後のURLへまず直接fetchする。失敗時は従来どおり
    中継へフォールバックし、中継には利用者が入力した**元のURL**を渡す（中継はサーバ側から
    取得するため置換不要で、元の共有URLで実績があるため）。
  - (d) 中継サーバ自体は別リポジトリの汎用サービスであり、WebNP2側のコードはプロジェクト名
    等を一切参照しない（`VITE_DISK_PROXY` のベースURLとエラーコードのみのやり取り）。
  - 中継の転送上限は 64MiB。超過時は `too_large` エラーとして案内する（仕様として許容し、
    回避策はダウンロードして画面へD&D）。
- **圧縮ファイル対応**: `hdd`/`fd1`/`fd2` の取得結果は拡張子に依らず先頭バイト列のシグネチャで
  ZIP/LZH かどうかを判定する。アーカイブと判定した場合は `arcurl:<元URL>` を groupId 兼
  sourceKey の接頭辞としてディスクライブラリへ展開結果を保存する（同じURLなら同じ
  groupId/sourceKeyになるため、再訪時はIndexedDB上のライブラリ内容から復帰し再ダウンロード
  しない）。展開結果が単一イメージならそのままスロットの起動イメージとして使うが、複数枚の
  場合はどのイメージを使うか自動で決められないため起動を中止し、ディスクライブラリを開いて
  該当 `arcurl:` グループを選ばせる。

## 2.1 ディスクライブラリへのD&D登録

- ディスクライブラリのダイアログ自体にディスクイメージ/ZIP/LZHをドロップした場合は、
  画面本体へのD&D（起動用スロットへのセット）とは異なり、スロットには入れずライブラリへの
  登録のみを行う（ライブラリ操作中＝どのスロットに入れるかは後で選ぶ、という文脈に合わせる）。
  ZIP/LZHに複数枚含まれる場合は他の展開経路と同様にアーカイブ名のフォルダへまとめ、
  展開・強調表示する。

## 3. ディスクイメージのライフサイクルと永続化

```
URL指定 ─fetch→ ArrayBuffer ─→ MEMFS (/disk/xxx) ─→ NP2kaiがR/W
                    ↑                    │ 変更検出
              IndexedDB ←────────────────┘ 自動保存
```

- **キー設計**: `sha256(元URL) or ファイル名` → `{ 元URL, 最終更新日時, イメージバイナリ }`
- **起動時**: 同キーの保存済みイメージが IndexedDB にあれば「前回の続き」を優先ロード
  （UI に「配布元の初期状態に戻す」ボタンを用意）
- **保存タイミング**:
  - `visibilitychange`(hidden) / `pagehide` で MEMFS からバイナリを読み出して保存
  - 加えて定期スナップショット（例: 30秒毎、変更があった場合のみ = バイト比較 or 書込みフック）
- **エクスポート**: 「ディスクをダウンロード」ボタンで現在のイメージを Blob 保存
- ローカルファイルの D&D 読み込みも同じ経路（キーはファイル名+サイズ）

## 4. wasm コア側に追加が必要なもの（NP2kai-wasm側の作業）

Phase 1 ではコア無改造で成立させる（cfg 注入 + main 起動のみ）。
Phase 2 で以下を C 側に追加し `EXPORTED_FUNCTIONS` で公開済み（TS側は `src/core/module.ts` の
`coreReset` / `coreSetFdd` / `coreStatSave` / `coreStatLoad` から `ccall` 経由で呼ぶ）:

| 関数 | 用途 | NP2kai内部 | 状態 |
|---|---|---|---|
| `webnp2_reset()` | リセット | `pccore_cfgupdate`+`pccore_reset` | Phase 2 対応済み |
| `webnp2_set_fdd(drive, path)` | FD挿抜(実行中) | `diskdrv_setfdd` | Phase 2 対応済み |
| `webnp2_statsave/statload(path)` | ステートセーブ | `statsave.c` | Phase 2 対応済み |
| `webnp2_key(code, down)` | キー注入 | `keystat.c` | Phase 3 対応済み |
| `webnp2_push_key_buffer(entry)` | キーボードBIOSバッファ直接注入(全角貼り付け用) | ワークエリア0x502 | Phase 3 対応済み |
| `webnp2_read_tvram()` / `webnp2_tvram_size()` | テキスト画面読出し | TVRAM (maketext.c 準拠のGDCアドレッシング) | Phase 3 対応済み |
| `webnp2_mouse_move(dx, dy)` | バスマウス相対移動の累積 | マウスデバイス | Phase 3 対応済み |
| `webnp2_mouse_pending()` | 未消費の移動量(max(|x|,|y|))取得 | マウスデバイス | Phase 3 対応済み |
| `webnp2_mouse_button(button, down)` | バスマウスのボタン押下/解放 | マウスデバイス | Phase 3 対応済み |
| `webnp2_mem_read/write(...)` | メモリアクセス(MCP用) | `mem[]` | Phase 3 予定 |
| `webnp2_audio_external(enable)` | SDL側音声コールバックの無音化切替 | `sound.c` | Phase 4 対応済み |
| `webnp2_audio_rate()` | コアの実効サンプルレート取得 | `sndstream` | Phase 4 対応済み |
| `webnp2_audio_chunk_frames()` | 1回のミックスで生成される固定フレーム数取得 | `sndstream.samples` | Phase 4 対応済み |
| `webnp2_audio_render()` | ミックスを1チャンク分生成しポインタ返却 | `sound_pcmlock/unlock` | Phase 4 対応済み(`sound_pcmlock/unlock`は1サイクルで`sndstream.samples`固定量しか消費しない設計のため、TS側は必ず`webnp2_audio_chunk_frames()`と同じフレーム数単位で吸い出す) |

### 4.1 デバッガAPI

UIを介さず `WebNP2` クラスから同期的に利用する。呼び出しは他の独自APIと同様、
メインループがフレーム境界の `emscripten_sleep(0)` でJSへ制御を返している間に行われる。

| TS API | wasm API | 用途 |
|---|---|---|
| `dbgSetPaused(boolean)` / `dbgIsPaused()` | `webnp2_dbg_set_paused` / `webnp2_dbg_paused` | CPU実行の一時停止・状態取得。停止中も描画とイベント処理は継続 |
| `dbgStep(count)` | `webnp2_dbg_step` | 停止中に指定命令数を実行。通常実行中は0を返す |
| `dbgReadRegs()` | `webnp2_dbg_regs` / `webnp2_dbg_regs_size` | レジスタのスナップショット取得 |
| `dbgDisasm(seg, off, count)` | `webnp2_dbg_disasm` | `seg:off` から逆アセンブル |
| `dbgSetBreakpoint(index, seg, off, enabled)` | `webnp2_dbg_set_bp` | 8個（index 0..7）のソフトウェアBP設定 |
| `dbgRunUntilBreakpoint(maxSteps)` | `webnp2_dbg_run_until_bp` | 1命令ずつ実行し、ヒットしたindex（無ヒットは-1）を返す |
| `readMemory(addr,len)` / `writeMemory(addr,bytes)` | `webnp2_mem_ptr` / `webnp2_mem_size` | メインRAMの範囲検査付き読書き。書込みはpause中だけ許可 |

`webnp2_dbg_regs()` のバッファはリトルエンディアンの `UINT32[17]`。順序は
`EAX, ECX, EDX, EBX, ESP, EBP, ESI, EDI, EIP, EFLAGS, CS, DS, ES, SS, FS, GS, CR0`。
TS側はこれを同名の小文字プロパティを持つ `Registers` にコピーする。

逆アセンブルのC側文字列は最大128行で、1行は
`<命令長>\t<16進バイト列>\t<ニーモニックとオペランド>\n`。
TS側は `{ addr, len, bytes, text }[]` へ変換し、`addr` は最初の `off` から各 `len` を
加算して求める。BPの座標系はリニアアドレスではなく、CPUレジスタと同じ
**16bitのCSセレクタ（seg）と32bitのEIP（off）の完全一致**。判定順は
「1命令実行 → 実行後のCS:EIPを照合」で、step/run-untilはいずれもpause中に呼ぶ。

```ts
np2.dbgSetPaused(true);
const regs = np2.dbgReadRegs();
const lines = np2.dbgDisasm(regs.cs, regs.eip, 5);
const targetOff = 0x1234; // 実行経路上の既知のオフセット
np2.dbgSetBreakpoint(0, regs.cs, targetOff, true);
const hit = np2.dbgRunUntilBreakpoint(1000);
np2.dbgSetPaused(false);
```

### 4.2 デバッガUIと疎通検証

「…」メニュー直結行のデバッガからCPUデバッガを開く。広幅（1000px以上）ではPC-98画面の変化を
Step中も同時に観察できるよう右側へドッキングし、狭幅では操作領域を確保するため前面パネルとして
表示する。右ドックではPause/Resume・Step・Run to BPのツールバーとレジスタを上部へ固定し、
逆アセンブルとメモリダンプだけをスクロールさせる。メモリダンプは1行16バイトの16進列とASCII列を
対応させ、狭い場合はダンプ領域内だけを横スクロールする。

ブラウザ上のwasm API疎通は `node scripts/dbg-smoke.mjs`、UIのDOM・レスポンシブ配置とスクリーン
ショットは `node scripts/dbg-ui-shot.mjs` で検証する。前者のBP検証は、FreeDOSの現在位置から数命令先を
推測せず、1命令ずつ実測して同じCS:EIPを4回（3周期）通過した安定周回地点を対象にする。実行位置や
分岐先は起動ごとに変わるため、固定アドレスや単なる「現在位置の数命令先」へ戻すと未到達になり、
テストがflakyになる。BPまでの命令数上限も観測した周期から算出する。

```sh
node scripts/dbg-smoke.mjs
node scripts/dbg-ui-shot.mjs
```

### 4.3 埋め込み公開API（packages/embed）

IDE等がWebNP2を画面構成から独立して利用できるよう、`packages/embed/src/index.ts` だけを公開入口とする。
公開面は次の3層に限定し、Bridge、player、storage、WebNP2固有のstrings・画面構成は内部実装に留める。

- エンジン層: `createWebNP2(canvas)` と `WebNP2Engine`。boot、リセット、実行中のFD挿抜、
  マウント情報、状態保存/復元、`pasteText`、`getScreenText`を提供する。HDDは実行中に
  交換できないためboot時だけ指定する。
- デバッグ層: `createDebugger` / `DebuggerController`、レジスタ・逆アセンブル・メモリ・BP操作と、
  購読解除関数を返す `onPause` / `onBreakpoint` を提供する。
- UI部品層: `mountDebuggerToolbar`、`mountRegisterView`、`mountDisassemblyView`、
  `mountMemoryDump`。各mountは更新・破棄用handleを返す。文言は引数で受け取り、i18nをimportしない。

WebNP2本体も `main.ts` のエンジン・デバッガ生成と `ui/debugger.ts` の各表示をこの公開実装へ委譲する。
本体側はドック配置、BPスロット管理、`strings.ts` から作った文言の注入だけを担当し、機能・表示実装を
複製しない。UIの共通CSSもembed側を本体から直接読み込む。

`npm run build:embed` はVite library modeで `webnp2-embed.js`（ESM）と `style.css`、TypeScriptで
`dist/types/` を生成する。UIを使う利用側はCSSも読み込む。NP2kai SDL2コアは非MODULARIZEで
グローバル `window.Module` とcanvasを保持するため、対応範囲は**1ページ1インスタンス**である。
同じページ内で多重化する場合はコア自体のMODULARIZE対応が先に必要になる。一方、別タブ、別ウィンドウ、
iframeはそれぞれ独立したJavaScript realmと`window.Module`を持つため、realmごとに1台ずつ独立して動作する。

`scripts/export-embed.sh` はライブラリのESM・CSS・d.tsと `LICENSE.WebNP2`、NP2kaiの
JS・wasm・font.bmp・`LICENSE.NP2kai` をPC98Devへ同期する。IDE実証用のFreeDOS(98)起動FDも
GPL表記を含む `README.txt` と対で同期する。WebNP2固有コードのライセンスは現時点で未指定のため、
`LICENSE.WebNP2` は出所・権利表示を保持し、新たな利用許諾を与えないことを明記する。

### 4.4 シーク音とポーズ中CPU削減（NP2kai-wasm側の作業）

`webnp2_seeksnd(void)` / `webnp2_seeksnd_set(int on)` でFDDシーク音のON/OFFを実行中にも
切り替えられるようにした。fdc.c 側はシークのたびに `np2cfg.MOTOR` を参照する実装のため、
このフラグを書き換えるだけで次のシークから即座に反映される。再起動やディスク差し替えは不要。
コア側の音源自体はNP2kaiが元々持つ `SUPPORT_SWSEEKSND` 機能で、波形も `fdd/fdd_mtr.res` に
ソース埋め込み済みのため**外部WAVファイルの追加配布は不要**。ビルド定義側は
`NP2kai_Emscripten_SDL2_base` へ `SUPPORT_SWSEEKSND` の1定義だけを足した。CMakeLists にある
`NP2kai_extra_definitions` をまとめて足すと `SUPPORT_NVL_IMAGES` 等の無関係な機能まで
有効化されてしまうため、既存のビルド構成に余計な差分を持ち込まないよう1つずつ選んで足す方針にした。

起動時の初期値はcfg注入（`src/core/module.ts` の `buildCfg()`）が担う。`Seek_Vol=25` を
**常に非0で**書き込む必要がある: `np2cfg.MOTORVOL` は `sound_init()` で起動時に一度しか
読まれずミキサトラックの登録有無を決めるため、0で起動すると後から `Seek_Snd` をONにしても
トラック自体が無く無音のままになる（実測で踏んだ罠）。音を鳴らす/鳴らさないの切り替えは
`Seek_Snd` の方で行い、`Seek_Vol` は音量調整専用に分離してある。`Seek_Snd` の値は
NP2kaiのiniパーサが文字列 `"true"` との完全一致だけを真とみなす実装のため、
`true`/`false` の文字列で書く（`1`/`0` は無警告で偽扱いになる）。

ポーズ中のCPU使用率を下げるため、以下を追加した。

- `webnp2_set_pause_sleep_ms(int ms)` / `webnp2_pause_sleep_ms()`: ポーズ中のメインループが
  1周ごとに待つ時間(ms)。0〜1000へクランプし、既定は33ms（従来の描画間隔相当）。
  TS側は `coreSetPauseSleepMs()`（`src/core/module.ts`）、デバッガ経由では
  `dbgSetPauseSleepMs()`（`src/api/webnp2.ts`）から呼ぶ
- ポーズ中の再描画を「メインループが毎周描く」設計から「JS側が要求したときだけ描く」設計へ
  変更した。内部用の `webnp2_request_pause_redraw()` / `webnp2_take_pause_redraw()` は
  ポーズ中でも画面操作（メモリ書き換え等）の結果を反映する経路として使うためのもので、
  JSから直接呼ぶAPIではない
- **`webnp2_dbg_set_paused()` と `webnp2_dbg_step()` は、呼ぶたびに待ち時間を既定の33msへ
  戻す。** これはツールバー以外の経路（デバッガパネルの一時停止/ステップボタン等）から
  ポーズされた場合でも、待ち時間が必ず既定値に揃うようにするための設計判断。
  UI側（ツールバーのポーズボタン）だけが、ポーズ後にUI用の200msを明示的に上書きする
  「後勝ち」の関係になっており、`setPaused(true)` を呼んだ**あとに**
  `setPauseSleepMs()` を呼ぶ順序に依存する（先に呼ぶと直後の `setPaused(true)` で
  33msへ巻き戻る）。この順序依存は `src/ui/player.ts` の `togglePausedByUser()` と
  `src/ui/debugger.ts` のコメントに明記してある

実測（Chrome DevTools `Performance.getMetrics` の `TaskDuration` を壁時計で割った、
レンダラのメインスレッド占有率）:

| 状態 | 占有率 |
|---|---|
| 実行中 | 約59〜67% |
| ポーズ直後 | 8.8% |
| ポーズして約20秒後 | 1〜3%へ収束 |
| 待ち時間200ms（安定域） | 1.3〜1.9% |
| 待ち時間33ms（安定域） | 3.6〜4.4% |

ポーズ中オーバーレイの表示有無による差は無かった（同一実行内の交互測定で1.3% vs 1.6%）。
また、タブを裏に回してもCPUは下がらない（65.2%のまま）。音を鳴らしているタブはブラウザの
バックグラウンドスロットリング対象から外れるためで、音声を`suspend()`して初めて
`setTimeout`が1回/秒へ絞られ1.5%になる＝エミュレータごと止まる。この実測は、5章で述べる
ミュートに`AudioContext.suspend()`を使わずGainNodeを使う設計の裏付けにもなっている。

## 5. UI (Phase 1 スコープ)

- 画面: canvas (通常640x400、31kHz時は640x480。整数倍/端数スケール + フルスクリーン)、下部に薄いツールバー
- ツールバー常設: リセット / フルスクリーン / ソフトキーボード（表示中は直後に⌨/🎮切替）/
  スクリーンショット / 「…」。低頻度操作は「…」内の表示・入力・サウンド・ディスク・ステート5グループと
  ROM登録・デバッガ・使い方・言語の直結行へ整理する（グループ順序は`src/ui/overflow-menu.ts`の
  `OVERFLOW_GROUP_ORDER`が基準）
- D&D: 画面へのドロップでイメージ読み込み（拡張子でFD/HDD自動判別、複数枚はダイアログ）
- キーボード: SDL2がdocumentで取得。ホストキー再割り当てはwindowのcapture段で先に受ける
- スマホ対応・ソフトキーボードは Phase 4 で実装済み(詳細は6章参照)

### 5.1 入力をPC-98キーへ統一する

WebNP2はPC-98のジョイスティック端子をエミュレートしない。PC-9801-26K/86等のサウンドボード側に
載る端子は対応ソフトが限られ、当時はSNE JOY-98V等のキーボード端子接続型ジョイスティックも
広く使われていたためである。物理ゲームパッドのボタン/軸、バーチャルパッド、ホストキー再割り当ては
すべて「PC-98スキャンコードを押す」割当へ落とす。libretroのRetroPad IDや仮想ジョイスティック
ポートを中間表現にせず、割当型は `{ kind: 'key'; code: number }` のみとする。

ソフトキーボードにはテンキーを含むPC-98配列を置く。テンキーのないノートPCではXak等の
テンキー移動専用ソフトが操作不能になるためで、スキャンコードはNP2kaiの`sdl/kbtrans.c`を
根拠にする。同じ配列定義を入力設定ダイアログ3タブ（ゲームパッド/キーボード/バーチャルパッド）の
割当先キーピッカーでも共用し、表示と割当で別表を持たない。

### 5.2 SharedKeyInputと複数入力源

ゲストへmake/breakを送る窓口は`SharedKeyInput`へ集約する。入力源はソフトキーボード、物理ゲームパッド、
ホストキー、バーチャルパッド、自動化API/bridgeをそれぞれ別sourceとして識別する。同じキーを複数源が
同時に押した場合は参照カウントを持ち、1源が離しただけではbreakを送らない。非表示化、切断、ページ離脱、
向き変更、割当変更ではsource単位で一括解放し、押しっぱなしを残さない。この窓口の出力をキー表示にも
接続することで、どの入力源でもソフトキーボード上の押下表示が同じように点灯する。

### 5.3 ホストキー再割り当て

ホスト物理キーを任意のPC-98キーへ差し替える機能は既定OFFとし、localStorageへバージョン付きの
名前付きプロファイルとして保存する。組み込みの「テンキー移動(矢印キー→テンキー)」は読み取り専用で、
編集時は複製する。Emscripten SDL2がdocumentでキーを取得するため、通常のbubble段では差し替え前の
キーが既にゲストへ届く。そこでwindowのcapture段で先に受け、元イベントを止めて割当後のスキャンコードを
`SharedKeyInput`へ渡す。入力設定の名前欄やメニューは逆にbubble段でkeydown/keyup/keypressを止め、
UI操作中の文字をSDLへ漏らさない。

### 5.4 バーチャルパッドの配置

主用途はスマートフォン/タブレットで、Pointer Eventsにより方向+ボタン等の複数同時押しを扱う。
透過overlayは指でゲーム画面を隠すため既定にせず、縦持ち（幅≦高さ）は画面下の`panel`、横持ち
（幅>高さ）は画面左右の`sides`領域へ自動配置する。ページ背景は白系半透明パッドが読める`#101010`とする。
PC-98は640x400と640x480を切り替え、後者はcanvas属性変更として現れてResizeObserverだけでは拾えないため、
MutationObserverでも再配置する。

### 5.5 入力パネル切替とツールバー

ソフトキーボードまたはバーチャルパッド表示中だけ⌨/🎮切替チップを出し、ツールバーのキーボードボタン
直後へ置く。stage右上への絶対配置案は採用しない。バーチャルパッドの`sides`は`position: fixed`でstage外まで
広がり、`panel`や積み上げるソフトキーボードとも高さが異なるため、stage基準のチップは画面に被り位置も
揃わない。ツールバーなら3配置と独立して常に同じ場所になる。切替前には閉じる入力源を必ず一括解放する。

横持ちの`sides`では、左右の操作領域を確保した結果コンソールカードが200px前後まで狭くなることがある。
FDD/HDD行は横スクロールにせず、フッター実幅320px以下でドライブ名とファイル名を第1段、操作ボタンを
第2段以降へ折り返す。タッチによる横スクロールとパッド操作を競合させず、全操作へ到達可能にするためである。

起動オーバーレイはボタンだけを起動導線とする。かつて余白クリックも起動扱いだったが、ボタンを外した
だけで誤起動するため廃止した。「…」の第1階層見出しも起点が自明なので省き、狭幅で親が消える第2階層の
見出しだけ残す。

### 5.6 バーチャルトラックパッド

入力パネルの第3の種類として、canvas直タッチ（絶対位置追従。指の真下にカーソルが来て指の影に
隠れる）とは別に、相対移動でPC-98バスマウスを操作する専用パネルを設ける（WebX68kからの移植）。
ジェスチャ解釈（`touch-mouse.ts`のTouchMouse）とDOM結線（`virtual-trackpad.ts`）を分離するのは、
タッチ実機なしでvitestから判定ロジック単体を検証するためで、二重実装も避けられる。DOM/BOMに
触れる側だけを呼び出し側で差し替えられるようにする、5.1の「解釈と結線を分ける」方針と同じ理由。

CSSピクセル→ゲストのドット数への換算は`main.ts`側でTRACKPAD_SCALE(=1.5)の固定倍率とし、canvasの
表示倍率（ウィンドウ幅やフルスクリーン状態で変わる）は使わない。表示倍率に連動させると、画面を
拡大縮小しただけでカーソル速度が変わってしまい、指の感覚と食い違う事故を構造的に避けるため。
クリックは`queueTouchOp`で直列化し、100ms押下+60ms間隔でパルス化する（連続クリックがゲスト側で
取りこぼされないようにする既存の仕組みをそのまま利用）。

2本指ドラッグ（トラックパッドの慣例でホイール相当）は実装しない。PC-98バスマウスは左右2ボタンの
みでホイールという概念自体が無く、NP2kai側も左右しか読んでいないため、実装しても受け取り先が無い。

### 5.7 入力パネル表示中の高さ収縮とテンキー開閉

ソフトキーボードのテンキーブロックは既定で非表示にし、キーボード内の専用キーで開閉する
（`kbd-layout.ts`のKBD_ROWSはゲームパッド割当ピッカーとも共用するため変更せず、`player.ts`側で
CSS状態クラス`tenkey-hidden`とトグルキーだけを足す）。物理テンキーの無い機器で常時テンキー行が
場所を取るのを避けつつ、必要な時だけ展開できるようにする。

キーボード/バーチャルパッド/バーチャルトラックパッドのいずれかが表示中は`document.body`へ
`input-panel-open`を付け、`rescale()`の高さ制約判定をフルスクリーン相当（1画面に収める計算）へ
切り替える。同時にFDスロット行を隠すのは、canvasを縮める→カード幅が縮む→FDスロット行が折り返して
周辺高さが増える→さらにcanvasを縮める…という収縮ループを避けるため（FDスロット行はカード幅に応じて
折り返す唯一の要素で、これを畳めばパネル表示中の周辺高さが幅に依存しなくなり計算が収束する。
操作頻度も低く、再表示は入力パネルを閉じるだけで済む）。`kbdPanel`/`trackpadPanel`の
class変化はMutationObserverでも監視し、`switchInputPanel`以外の経路で状態クラスが変わっても
`input-panel-open`が追従するようにする。

### 5.8 ポーズ/再開とサウンドメニュー

ポーズの真の状態はコア側のフラグ1つ（`webnp2_dbg_paused()`）で、UI側はそれとは別に
`pausedByUser`（一時停止オーバーレイを出すかどうか）だけを持つ。両者を分けているのは、
デバッガパネルのステップ実行がコアのポーズフラグを直接操作するため、そのままUIの
「一時停止」と同一視すると、ステップのたびに画面が毎回暗転して操作の邪魔になるからである。
`pausedByUser`はツールバーのポーズボタンから操作された場合だけ立ち、デバッガ側の都合で
再開された場合は4Hzの定期チェックで「コアが再開しているのにフラグがtrueのまま」という
食い違いだけを解消する片方向同期で追従させる（`src/ui/player.ts`）。`pausedByUser`は
意図的にlocalStorageへ保存しない。ポーズしたままリロードすると次回起動時に暗転した
画面しか見えず、そこから抜け出す手段が無くなるため。

オーバーレイの再開は中央の再生ボタン（`btnPauseOverlayResume`）だけから行う。かつては
オーバーレイの余白クリックでも再開できたが、暗転した画面のどこを押しても再開してしまい
誤クリックで意図せず再開する事故があったため、ボタン以外のクリックは`stopPropagation()`
で握りつぶすだけに変更した。

ポーズUIの更新（`src/ui/pause-ui.ts` の `createPauseUiUpdater`）は**状態が変わったときだけ
DOMへ触る**ようにしてある。かつては4Hzのポーリング（`setInterval`）から毎回無条件に
`btnPause.replaceChildren(...)` を呼んでいた。これがボタンの唯一の子要素（実際にクリック
される`<svg>`）を250msごとに作り直してしまい、mousedownからmouseupまでの間にこの
差し替えが挟まると、押した要素がDOMツリーから外れてclickイベントが発火しなくなる不具合が
あった（「何度か続けて押さないとポーズしない」という報告と一致する）。対策として、直前に
描画した状態（`corePaused`/`pausedByUser`）をキャッシュし、同じ状態なら
`classList.toggle`/`replaceChildren`/`title`/`setAttribute`のいずれにも触らないように
分離した。言語切替のように状態は変わらず表示文言だけ作り直したい場合は`invalidate()`で
キャッシュを明示的に無効化する。

ツールバーは「中央グループ（頻繁に押す操作）」と「右端グループ（誤爆の被害が大きい
マシンリセット）」の2群に分けた。CSSは3列グリッド（`minmax(0,1fr) auto minmax(0,1fr)`）にし、
中央グループを2列目、右端グループを3列目に置く。1列目は空のスペーサーで、これにより
3列目の幅が中央グループの位置を引っ張らず、ツールバー全体に対して中央グループが真に
中央へ来る（`justify-content:space-between`や`margin-left:auto`は右側の要素幅ぶん
中央がずれるため不採用にした）。狭幅では`@container`側で縦積みに切り替わる。

サウンドメニュー（オーバーフローメニューの「サウンド」グループ）は、ミュートとFDDシーク音
ON/OFFの2項目を持つ。ミュートは AudioWorklet と `destination` の間に挟んだ GainNode の
`gain.value` を0/1に切り替える方式で、`AudioContext.suspend()` は使わない。ワークレット→
メインスレッドの音声吸い出しはpull型（ワークレット側の要求駆動）で、`suspend()`すると
この吸い出しごと止まり、コアの音声レンダリング呼び出しも止まってしまうため
（4.4節の実測どおり、これはCPU使用率にも波及する）。デバッグ用の覗き窓
`window.__webnp2Audio`（`src/core/audio.ts`）にミュート後段の出力ノードを`gain`として
公開してあり、AnalyserNodeやScriptProcessorNodeを繋げば「実際にdestinationへ送られている
音」を測定できる。FDDシーク音のON/OFFは`coreSeekSoundSet()`経由で`webnp2_seeksnd_set()`を
呼ぶだけで、起動時の初期値（`buildCfg()`の`Seek_Snd`）とは別経路になる。

### 5.9 4:3表示補正（表示モード）

PC-98実機は解像度に関わらず640x400/640x200等をブラウン管4:3いっぱいに表示する。ドット等倍
（正方形ピクセル）表示は実機より縦が詰まって見えるため、WebX68k（`sharp-view.ts`）からの
移植として4:3補正表示モードを追加し、既定にした（PC-9821の640x480は元々正方形ピクセルの
ため補正なし）。

- 補正は**拡大方向のみ**（`src/ui/aspect.ts`の`getTargetSize()`）。縮小方向にも対応すると
  `pixelated`で1ドット幅の線が間引かれ文字が潰れるため、常に実解像度以上へ拡大する側でしか
  縦横比を合わせない
- `#canvas`（NP2kaiコアがSDL/WebGLで直接描画する実解像度のcanvas）はバッファ・描画ともに
  変更しない。表示専用の重ねcanvas（`src/ui/sharp-view.ts`）を`#canvas`の上に置き、そちらへ
  シャープ寄りのバイリニアで4:3補正後のサイズへ描画する
- コアは新フレームの通知を出さないため、重ねcanvasの`present()`は`requestAnimationFrame`
  ループで毎フレーム呼び続ける（ポーズ中・リサイズ直後にも追従させるため）
- `player.ts`の`rescale()`は4:3補正後の目標サイズを基準にした整数倍判定に変更した
- 設定は`localStorage`（既定`4:3`）、URL `?aspect=4:3|native`は起動時のみ上書き可能
  （以後は「…」→「表示」→「表示モード」のトグルとlocalStorageに従う）
- マウス/タッチ座標換算は元々X/Y別倍率だったため変更不要。スクリーンショットは元々
  `#canvas`（実解像度）を直接使うため変更不要。`packages/embed`は`player.ts`を共有しない
  ため既定挙動に影響しない

## 6. フェーズ分割

- **Phase 1 (MVP)**: リポジトリ scaffold / core層+API層の骨格 / URLパラメータ読込 / D&D /
  IndexedDB 永続化 / ディスクDL / フルスクリーン / GitHub Pages 等での静的配信
- **Phase 2**: コアC API追加（リセット・実行中ディスク交換・ステートセーブ）/ 設定UI(クロック等) /
  セーブ用ブランクFD自動生成 — 実装済み（`?clk=` パラメータ、ツールバーのアイコン化、FD1/FD2挿抜UI、
  ステート保存/復元、ステートのIndexedDB永続化）
- **Phase 3**: 制御プレーンの WebSocket 公開 + MCPサーバー（別パッケージ `mcp/`）/
  テキストVRAM読出し・キー注入 — 実装済み（`?bridge=` パラメータで `src/api/bridge.ts` が
  WebSocket接続、`mcp/server.mjs` がMCP(stdio)+WSサーバー。ツール: screen_text /
  type_text / send_keys / key_sequence / key_code / reset / screenshot / save_state /
  load_state / list_states / wait_screen_change。`getScreenText()` はTVRAMを
  JIS→SJIS変換しTextDecoder('shift_jis')でデコード、`typeText()`/`sendKeys()` は
  `src/api/keymap.ts` のPC-98配列スキャンコード表で打鍵）。メモリアクセスAPIは未実装
- **Phase 3.5**: ローカルROM/素材ファイル登録 — 実装済み（「…」直結行の「ROM登録」ダイアログで
  bios.rom / itf.rom / sound.rom / font.rom / 2608_*.wav 等を登録。IndexedDB(キー`rom:<name>`)に
  ブラウザ内保存し、起動時に MEMFS ルートへ自動注入。font.rom 登録時は cfg の fontfile を
  /font.rom に切替。ROMは読み取り専用扱いで永続化ループ対象外。YM2608リズム波形6本
  (`2608_*.wav`)だけは、WebNP2が固定で使うfmgenコア(`buildCfg()`の`USEFMGEN=true`)が
  大文字名(`2608_BD.WAV`等)しか探さないため、preRunでMEMFSルートへ小文字名・大文字名の
  両方を複製して書く。同梱の代替波形(`public/rhythm/`、作者制作・実チップROM非由来)を
  `mergeRhythmDefaults()`で足し合わせ、利用者登録がある名前はそちらを優先し同梱側は使わない。
  登録時は`checkRhythmWav()`でfmgenの読み取り条件(RIFF/WAVE、fmtチャンク、リニアPCM、
  モノラル、dataチャンク存在、サンプル数上限、16bit)を検査し、満たさなければ保存せず理由を
  表示する。fmgenは6本のうち1本でも不正だと全リズムを無音にし、dataチャンクが無いWAVは
  走査ループがEOFガード無しでハングしうるため、フォールバックさせず登録時点で弾く）
- **Phase 3.6**: ホスト側テキスト送信(全角対応) — 実装済み（「…」→「入力」→「テキスト送信」で
  チャット風入力バー表示。ホストIMEで変換済みテキストをTextDecoder('shift_jis')逆引きで
  SJIS化し、PC-98キーボードBIOSリングバッファ(0x502)へ直接注入。ゲスト側FEP不要で
  DOS標準入力に全角文字が入る。MCPツール paste_text / ブリッジ cmd paste_text も追加）。
  ゲスト常駐TSR(PASTE.COM)経由の経路も追加: 常駐時はpasteTextが自動でメールボックス
  書き込みに切り替わり、NEC MS-DOSでも全角ペースト可能（MCPツール setup_paste_helper /
  wait_screen、ブリッジ cmd setup_paste_helper / wait_screen も追加）
- **Phase 3.7**: MCP経由のマウス操作 + 画面テキスト検索 — 実装済み（バスマウスは相対移動のみ
  のため、ホスト側(`src/api/webnp2.ts`)が画面外へ大きく動かして左上へ押し付ける「ホーミング」
  基準からの相対移動で絶対座標指定を実現。MCPツール mouse_move / mouse_click / mouse_drag /
  mouse_home / find_text / click_text、ブリッジ cmd も同名で追加。find_text/click_text は
  getScreenText().lines を走査してテキスト画面上の文字列位置を検索する）
- **Phase 3.8**: MCP経由のディスク操作 — 実装済み（`src/api/webnp2.ts` に listDisks /
  listDiskLibrary / insertFdFromUrl / insertFdFromLibraryKey / insertBlankFd /
  exportDiskBase64 を追加。MCPツール list_disks / list_disk_library / insert_disk /
  eject_disk / export_disk / persist_disks、ブリッジ cmd も同名で追加。exportDiskBase64は
  5MB超をエラーにしUIダウンロードボタンへ誘導）
- **Phase 3.9**: MCP経由のディスク内ファイル読み書き(FAT12/16) — 実装済み（`src/api/fat.ts`
  新設: ブートセクタのBPBからFAT12/FAT16・セクタサイズ等を自動判別する最小リーダ・ライタ
  (openFat/fatList/fatReadFile/fatWriteFile/fatDeleteFile/fatFreeSpace)。8.3形式のみ対応
  (LFNエントリは列挙時スキップ)、ゲストOSを介さずMEMFS上のイメージバイトを直接読み書きする。
  `src/api/webnp2.ts` に diskListFiles/diskReadFile/diskWriteFile/diskDeleteFile を追加
  (対象はfd1/fd2のみ、hddはError)。書き込み/削除後はDOS側ディスクキャッシュを破棄させるため
  coreSetFdd で排出→100ms待ち→再挿入(メディア交換)してからpersistNow()でIndexedDBへも保存。
  ブリッジ cmd disk_list_files/disk_read_file/disk_write_file/disk_delete_file、
  MCPツールも同名で追加。書き込み時のテキストはASCIIそのまま/改行はCRLF/他はencodeSjisUnitsで
  Shift_JISへ変換(`src/api/bridge.ts` encodeTextForDisk)。バイナリはbase64往復に対応）
- **Phase 3.10**: MCP経由のFD↔HDD間ファイル転送(複合ツール) — 実装済み。HDDイメージをホストが
  直接書き換えるとDOSのディスクキャッシュと衝突して危険なため、「ホストはFDだけ読み書きし、
  FD↔HDD間のコピーはゲストのDOSにCOPYさせる」経路を1ツールにまとめた。`src/api/webnp2.ts` に
  ensureTransferFd(未マウントならツールFD `./tools/webnp2tools.xdf` を挿入。FAT12フォーマット済み
  でブランクFDより都合が良いため流用)/ guestDriveLetter(FD1='B:', FD2='C:' 既定)/
  putFileToGuest(FDへdiskWriteFile→ゲストへ`COPY <FD> <宛先>`をtypeText→待機後に画面文字列で
  成功/失敗判定)/ getFileFromGuest(ゲストへ`COPY <取得元> <FD>`→判定→500ms待ってdiskReadFile)を
  追加。判定文字列は成功/失敗それぞれ配列で定数化(日本語NEC MS-DOS/英語DOS両対応)。
  encodeTextForDisk/bytesToBase64/base64ToBytesは元々bridge.ts側の重複実装だったものを
  webnp2.tsへ集約しexport、bridge.tsはそちらをimportする形に整理。ブリッジ cmd put_file/get_file、
  MCPツールも同名で追加(説明文に「HDDへの書き込み/読み出しはこの経路が安全」と明記)。
  なお Phase 3.11 で起動前のHDD直接編集ができるようになったため、この「直接触るな」の
  制約は**実行中に限る**話になった。説明文もその旨に更新済み(起動前の直接編集はUI専用で、
  MCPには公開していない。必要になったら library_* 系コマンドとして足す余地がある)
- **Phase 3.11**: HDDイメージの起動前編集 — 実装済み。従来HDDは「起動して使う」しか経路が無く、
  ホストからの読み書きは Phase 3.10 のゲストCOPY経由に限られていた。コアが実行中のHDD挿抜に
  未対応なのは変わらないので、**編集できるのは起動前だけ**というルールで整理した。
  - `src/api/fat.ts`: HDDヘッダ(.thd=256B固定/.nhd/.hdi/.hdd=ヘッダ内ジオメトリ、定義は NP2kai の
    `fdd/sxsihdd.{c,h}` 準拠)を飛ばし、PC-98パーティションテーブル(物理セクタ1、32B×最大16エントリ、
    開始CHS→バイトオフセット換算)から最初にFATとして開けるパーティションを採用する。
    パーティションテーブルを持たないイメージ向けにヘッダ直後へのフォールバックも試す。
    FAT本体はFD用の実装をそのまま流用(BPBから2048B/sectorも読める)。
  - 未マウントHDDは理屈上は起動中でも安全に書けるが、「動いてる方は書けないのに隣は書ける」UIは
    誤解を招くため、`assertLibraryWritable` で起動後は一律禁止し「HDDは起動前だけ」に統一した。
  - 起動前の「セット」状態(`pendingBoot`)を新設。起動前のHDDドロップ/スロット読み込み/
    ライブラリの「HDDにセット」はいずれも起動せずスロットへ割り当てるだけにし、起動は
    オーバーレイの起動ボタンで明示的に行う(文言も「ディスク無しで起動」/「セットしたディスクで起動」
    に出し分け)。セット後にファイルマネージャで編集される前提なので、`bootWithImages` で
    起動直前にIndexedDBからバイト列を読み直す(セット時のスナップショットで起動すると編集が消える)。
  - `createFormattedHdd()`: FAT16フォーマット済みブランクHDD(T98 .thd)の生成。ジオメトリは
    NP2kai の `sasihdd[]` にある標準SASI 40MB(33セクタ×8ヘッド×615シリンダ)に合わせ、
    非標準ジオメトリ扱いを避ける。第0シリンダにIPLシグネチャ("IPL1"+0x55AA)とパーティション
    テーブル、第1シリンダから単一FAT16パーティション。IPLの実体(ブートコード)は持たないため
    HDD単体では起動できず、FDからDOSを起動してデータドライブとして使う想定。
    FreeDOS(98)で `C: SASI1:256 [WebNP2], size=39MB` として認識され、DOS側からのCOPYも通ることを確認済み。
- **Phase 4**: スマホUI / AudioWorklet化(遅延30ms台) / FreeDOS(98) 同梱の公開デモ構成
  — FreeDOS(98)起動FD同梱は実装済み（`public/freedos/fd98_2hd.xdf`、GPLv2+、
  `?freedos=1` / 起動オーバーレイ2択（保存済みディスクがあれば3択）/ FDD1「FreeDOS(98)挿入」ボタン、
  IndexedDB固定キー`freedos:fd98_2hd`で永続化）。スマホUIも実装済み（画面幅640px未満で
  端数スケール縮小表示、タップ=左クリック/指移動=カーソル追従/約0.5秒長押し後の移動で
  左ボタンドラッグ/2本指タップ=右クリック、ツールバーのキーボードアイコンでPC-98配列
  テンキー付きソフトキーボード開閉(SHIFT/CTRL/GRPHはワンショット、CAPS/かなはロックトグル)、
  物理ゲームパッド/ホストキー再割り当て/バーチャルパッド、縦`panel`・横`sides`自動配置、
  キーリピート有効化(delay 500ms/interval 50ms、物理キーボードにも適用)）。
  AudioWorklet化も実装済み（`src/core/audio.ts`新設。コアのミックスを
  `webnp2_audio_render`で直接吸い出しAudioWorklet(音声スレッド)のリングバッファへ
  流し込むpull型: ワークレット側がリング残量不足時にpostMessage('need')でメイン
  スレッドへ要求し、メインスレッドがミックスをFloat32Arrayのtransferableで返す。
  SharedArrayBuffer不使用のためCOOP/COEPヘッダ無しのGitHub Pagesでも動作。既定で
  有効、`?worklet=0`で従来のSDL(ScriptProcessor)経路に戻せる。非対応ブラウザは
  自動フォールバック。`?alat=N`でリング下限水位の初期値(ms)を指定可能、既定はコア1チャンク分。アンダーラン検出で上限(3チャンク分)まで自動引き上げ）

## 7. リポジトリ構成

```
WebNP2/
├── docs/DESIGN.md          … 本書
├── public/core/            … NP2kai-wasm ビルド成果物 (js/wasm/font.bmp)
├── src/
│   ├── core/               … Emscripten Module ラッパ
│   ├── api/                … WebNP2 クラス + CommandBus
│   ├── storage/            … IndexedDB
│   ├── ui/                 … プレイヤーUI (素のDOM)
│   └── main.ts
├── scripts/update-core.sh  … NP2kai-wasm から成果物を取り込む
├── index.html
├── vite.config.ts
└── package.json
```

- コア取込は当面「ビルド成果物のコピー」(scripts/update-core.sh)。サブモジュール化は必要になったら。
- ライセンス: NP2kai は BSD系 → 成果物同梱時に `public/core/LICENSE.NP2kai` を同梱。
- ROM・市販ソフトのイメージは一切同梱しない（フォントは東雲由来の font.bmp を生成同梱）。
