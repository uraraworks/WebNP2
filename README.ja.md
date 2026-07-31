# WebNP2

[English](README.md)

PC-98 エミュレータ [NP2kai](https://github.com/AZO234/NP2kai) の wasm ビルド (NP2kai-wasm) を
ブラウザ上で動かすための Web プレイヤー。「URL を開くだけで起動・プレイ・セーブの持ち越し」
ができる体験を目指した Phase 1 (MVP) 実装。

設計の詳細は [docs/DESIGN.md](docs/DESIGN.md) を参照。

## 使い方

### URL パラメータ

```
https://.../?hdd=<HDDイメージURL>&fd1=<FD1イメージURL>&fd2=<FD2イメージURL>&run=1&clk=<倍率>&lang=ja
```

| パラメータ | 意味 | 備考 |
|---|---|---|
| `hdd` | HDDイメージのURL | NP2kai対応形式 (.thd 等) |
| `fd1` / `fd2` | FDイメージのURL | .d88 / .fdi 等 |
| `run` | `1` で自動起動フローに進む | 音声再生のブラウザ制限があるため、`run=1` でも実際の起動は「クリックして起動」オーバーレイのクリックが必要 |
| `clk` | クロック倍率 | 現バージョンでは未使用（受け取るのみ、Phase 2 で対応予定） |
| `lang` | UI表示言語 (`ja` / `en`) | 省略時は `localStorage['webnp2.lang']` → ブラウザの `navigator.language` (ja始まりなら `ja`) → 既定 `en` の順で決定。ツールバー右端の言語トグルボタンで切替可能（切替内容は `localStorage` に保存され、次回以降の既定言語になる） |

パラメータを1つも指定しない場合はイメージ無しの状態で開き、画面へのドラッグ&ドロップで
HDD/FDイメージを読み込んで起動できる。

**重要: `hdd`/`fd1`/`fd2` に指定するURLは CORS (`Access-Control-Allow-Origin`) が
有効な配信元である必要がある。** ブラウザの `fetch` でイメージを取得するため、配布側の
サーバーで CORS ヘッダーが付与されていないと取得に失敗する（画面にエラーメッセージが
表示される）。

### ドラッグ&ドロップ

画面領域にファイルをドロップすると拡張子から HDD/FD を自動判別して読み込む。

- HDD 判定: `.thd` `.hdi` `.nhd` `.hdd`
- FD 判定: `.d88` `.fdi` `.xdf` `.dup` `.fdd` `.hdm`

複数ファイルを同時にドロップした場合は確認ダイアログを挟む。

### 進行状況の保存

起動後、マウント中の各イメージは 30 秒間隔のタイマー、タブが非表示になったとき
(`visibilitychange`)、ページ離脱時 (`pagehide`) に変化を検出して IndexedDB (`webnp2` DB)
へ自動保存される。次回同じ URL で開くと保存済みの状態から再開する。
「初期状態に戻す」ボタンで保存分を削除し、配布元 URL から再取得できる。

「ディスクをダウンロード」ボタンで現在のディスクイメージを Blob としてダウンロードできる。

## 開発方法

```sh
npm install
npm run dev       # 開発サーバー
npm run build     # 型チェック + 本番ビルド (dist/)
npm run preview   # ビルド成果物のプレビュー
```

### コア (public/core/) の更新

`public/core/` には [NP2kai-wasm](../NP2kai) のビルド成果物
(`emnp21kai_sdl2.js` / `.wasm` / `font.bmp` / `LICENSE.NP2kai`) を配置する。
このディレクトリは git 管理対象（ビルド成果物をリポジトリにコミットする方針）。

コアを再取得・更新する場合:

```sh
scripts/update-core.sh
```

デフォルトでは `/Users/haruurara/MyProject/_emulator/PC98/NP2kai/build` からコピーする。
別の場所からコピーしたい場合は環境変数 `NP2KAI_BUILD_DIR` / `NP2KAI_ROOT_DIR` を指定する。

### 動作確認用ファイル

`public/test/` はローカルでの動作確認用に HDD イメージ等を置く場所（`.gitignore` で
除外済み、コミットされない）。

## ライセンス・同梱物について

- 本リポジトリのコード自体のライセンスは特に定めていない（社内ツール）。
- `public/core/` に含まれる NP2kai-wasm のビルド成果物 (`emnp21kai_sdl2.js` /
  `emnp21kai_sdl2.wasm` / `font.bmp`) は NP2kai (BSDライセンス系) のビルド成果物であり、
  ライセンス文は `public/core/LICENSE.NP2kai` を参照。
- **PC-98 の ROM イメージ・市販ソフトウェアのディスクイメージは一切同梱していない。**
  `font.bmp` は東雲フォント由来のフォントデータで、著作権上の問題がある PC-98 実機 ROM
  とは別物。
- ユーザーが `hdd`/`fd1`/`fd2` パラメータや D&D で読み込ませるディスクイメージについては
  各自が適法に入手・使用する責任を負う。

## Phase 1 (MVP) のスコープ

- リポジトリ scaffold (Vite + TypeScript)
- core層/API層の骨格 (Emscripten Module 起動・CommandBus)
- URL パラメータ読込・fetch進捗表示
- ドラッグ&ドロップでのイメージ読込
- IndexedDB による永続化（自動保存・前回状態からの再開・初期化）
- ディスクイメージのダウンロード
- フルスクリーン表示
- 静的ホスティング (GitHub Pages 等) での配信を想定した構成

Phase 2 以降（実行中のディスク交換・リセット・ステートセーブ・設定UI 等）は
[docs/DESIGN.md](docs/DESIGN.md) を参照。
