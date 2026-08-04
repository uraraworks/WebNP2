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
| `fd1` `fd2` | FDイメージのURL | .d88/.fdi 等 |
| `state` | (将来) ステートセーブのURL | |
| `run` | `1`で自動起動 | 無指定時はクリックで起動(音声制限対策) |
| `clk` | クロック設定 | 省略時デフォルト |
| `paste` | `1`=全角利用可として扱う / `0`=テキスト送信UIを完全非表示 | 省略時は起動後にボタン表示。全角可否はFreeDOS(98)マウント/TSR常駐で自動判定 |

- イメージ取得は `fetch`。**CORS 必須**（配布側に `Access-Control-Allow-Origin` が必要）。README に明記する。
- 取得中はプログレスバー表示。失敗時は理由（CORS/404）を分かる形で表示。
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

ツールバーのデバッガボタンからCPUデバッガを開く。広幅（1000px以上）ではPC-98画面の変化を
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

## 5. UI (Phase 1 スコープ)

- 画面: canvas (640x400、整数倍スケール + フルスクリーン)、下部に薄いツールバー
- ツールバー: 起動/リセット / FD1・FD2・HDD スロット表示 / ディスクDL / 初期状態に戻す / 音量 / フルスクリーン
- D&D: 画面へのドロップでイメージ読み込み（拡張子でFD/HDD自動判別、複数枚はダイアログ）
- キーボード: canvas フォーカス時に取得。ブラウザショートカットと衝突するキーは capture
- スマホ対応・ソフトキーボードは Phase 4 で実装済み(詳細は6章参照)

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
- **Phase 3.5**: ローカルROM/素材ファイル登録 — 実装済み（ツールバー「ROM登録」ダイアログで
  bios.rom / itf.rom / sound.rom / font.rom / 2608_*.wav 等を登録。IndexedDB(キー`rom:<name>`)に
  ブラウザ内保存し、起動時に MEMFS ルートへ自動注入。font.rom 登録時は cfg の fontfile を
  /font.rom に切替。ROMは読み取り専用扱いで永続化ループ対象外）
- **Phase 3.6**: ホスト側テキスト送信(全角対応) — 実装済み（ツールバー「テキスト送信」で
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
  `?freedos=1` / 起動オーバーレイ2択 / FDD1「FreeDOS(98)挿入」ボタン、
  IndexedDB固定キー`freedos:fd98_2hd`で永続化）。スマホUIも実装済み（画面幅640px未満で
  端数スケール縮小表示、タップ=左クリック/指移動=カーソル追従/約0.5秒長押し後の移動で
  左ボタンドラッグ/2本指タップ=右クリック、ツールバーのキーボードアイコンでPC-98配列
  ソフトキーボード開閉(SHIFT/CTRL/GRPHはワンショット、CAPS/かなはロックトグル)、
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
