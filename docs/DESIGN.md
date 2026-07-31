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

## 5. UI (Phase 1 スコープ)

- 画面: canvas (640x400、整数倍スケール + フルスクリーン)、下部に薄いツールバー
- ツールバー: 起動/リセット / FD1・FD2・HDD スロット表示 / ディスクDL / 初期状態に戻す / 音量 / フルスクリーン
- D&D: 画面へのドロップでイメージ読み込み（拡張子でFD/HDD自動判別、複数枚はダイアログ）
- キーボード: canvas フォーカス時に取得。ブラウザショートカットと衝突するキーは capture
- スマホ対応・ソフトキーボードは Phase 3 以降

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
- **Phase 4**: スマホUI / AudioWorklet化(遅延30ms台) / FreeDOS(98) 同梱の公開デモ構成
  — FreeDOS(98)起動FD同梱は実装済み（`public/freedos/fd98_2hd.xdf`、GPLv2+、
  `?freedos=1` / 起動オーバーレイ2択 / FDD1「FreeDOS(98)挿入」ボタン、
  IndexedDB固定キー`freedos:fd98_2hd`で永続化）

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
