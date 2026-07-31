# WebNP2

[English](README.md)

PC-98 エミュレータ [NP2kai](https://github.com/AZO234/NP2kai) の wasm ビルド (NP2kai-wasm) を
ブラウザ上で動かすための Web プレイヤーです。「URL を開くだけで起動・プレイ・セーブの持ち越し」
ができる体験を目指しています。

設計の詳細は [docs/DESIGN.md](docs/DESIGN.md) を参照してください。

## 今すぐ試す

- **公開ページ**: <https://uraraworks.github.io/WebNP2/>
- **FreeDOS(98) 自動起動デモ**: <https://uraraworks.github.io/WebNP2/?freedos=1&run=1>
  （クリック不要で DOS プロンプトまで起動。音声は最初のクリックで有効化）

ROM・市販ソフトのイメージは同梱していません。手元の HDD/FD イメージは
画面へのドラッグ&ドロップで読み込めます。

## 使い方

### URL パラメータ

```
https://.../?hdd=<HDDイメージURL>&fd1=<FD1イメージURL>&fd2=<FD2イメージURL>&run=1&clk=<倍率>&lang=ja
```

| パラメータ | 意味 | 備考 |
|---|---|---|
| `hdd` | HDDイメージのURL | NP2kai対応形式 (.thd 等) |
| `fd1` / `fd2` | FDイメージのURL | .d88 / .fdi 等 |
| `run` | `1` でオーバーレイ無しに即自動起動 | 音声再生のブラウザ制限により無音で起動し、「音声はミュート中」バナーを表示。最初のクリックやキー入力で音声が有効になる |
| `mem` | 拡張メモリ容量(MB) | 既定は `1`（本体640KB＋拡張1MB＝標準的なDOS構成）。多くのメモリが必要なソフトでは `mem=13` などに増やす。0〜230にクランプ |
| `clk` | クロック倍率 | cfg の `clk_mult` に反映（1〜32 にクランプ、整数）。省略時はコア既定値 |
| `lang` | UI表示言語 (`ja` / `en`) | 省略時は `localStorage['webnp2.lang']` → ブラウザの `navigator.language` (ja始まりなら `ja`) → 既定 `en` の順で決定。ツールバー右端の言語トグルボタンで切替可能（切替内容は `localStorage` に保存され、次回以降の既定言語になる） |
| `freedos` | `1` で同梱の FreeDOS(98) 起動FDをFD1として起動対象にする | `public/freedos/fd98_2hd.xdf` をFD1にマウントする（`fd1` 指定がある場合はそちらが優先）。`run=1` と組み合わせれば既存の自動起動フローに乗る |

`hdd`/`fd1`/`fd2`/`freedos` のいずれも指定しない場合、起動オーバーレイに
「そのまま起動」（イメージ無しの状態で開始し、以降は画面へのドラッグ&ドロップで
HDD/FDイメージを読み込める）と「FreeDOS(98) で起動」（後述の同梱起動FDで起動する）の
2択が表示されます。URLパラメータでディスクを1つでも指定した場合は、従来通り単一の
「クリックして起動」ボタンになります。

**重要: `hdd`/`fd1`/`fd2` に指定するURLは CORS (`Access-Control-Allow-Origin`) が
有効な配信元である必要があります。** ブラウザの `fetch` でイメージを取得するため、配布側の
サーバーで CORS ヘッダーが付与されていないと取得に失敗します（画面にエラーメッセージが
表示されます）。

### ドラッグ&ドロップ

画面領域にファイルをドロップすると拡張子から HDD/FD を自動判別して読み込みます。

- HDD 判定: `.thd` `.hdi` `.nhd` `.hdd`
- FD 判定: `.d88` `.fdi` `.xdf` `.dup` `.fdd` `.hdm`

複数ファイルを同時にドロップした場合は確認ダイアログを挟みます。

### キーボード・マウス

- キー入力は生のスキャンコードとしてゲストに送られます。PC-98 特有のキーは
  XFER=右Alt(右Option)、NFER=左Alt(左Option) に割り当てられています。
- **ゲスト内での漢字入力**には、ゲスト側に FEP（かな漢字変換の常駐ソフト。
  ATOK・VJE-β 等）が必要です。ホストOSの IME はエミュレータ画面には効きません
  （使用時はホスト IME をオフにしてください）。FreeDOS(98) に FEP は
  含まれていないため、漢字入力にはお手持ちの MS-DOS + FEP 環境のディスク
  イメージを使用してください。
- **マウス**はツールバーの「マウスキャプチャ」ボタンで有効になります
  （PC-98 バスマウスとしてエミュレートされ、ポインタは画面にロックされます。
  Esc キーで解除）。DOS プロンプト自体はマウスを使いません。バスマウスを
  直接読むソフトはそのまま動作しますが、int 33h API を使うソフトには
  ゲスト側にマウスドライバ (MOUSE.SYS 等) が必要です。
- マウス操作が重いソフトでは `?clk=8` などでクロック倍率を上げると
  軽くなります。ただし上げすぎるとホスト側の処理が実時間に追いつかず
  逆にカクつくため、環境ごとに滑らかに動く範囲で調整してください。

### 進行状況の保存

起動後、マウント中の各イメージは 30 秒間隔のタイマー、タブが非表示になったとき
(`visibilitychange`)、ページ離脱時 (`pagehide`) に変化を検出して IndexedDB (`webnp2` DB)
へ自動保存されます。次回同じ URL で開くと保存済みの状態から再開します。
「初期状態に戻す」ボタンで保存分を削除し、配布元 URL から再取得できます。

「ディスクをダウンロード」ボタンで現在のディスクイメージを Blob としてダウンロードできます。

### 同梱の FreeDOS(98) 起動FD

`public/freedos/fd98_2hd.xdf` は、MS-DOS互換OS FreeDOS を NEC PC-9801/9821
シリーズ向けに移植した [FreeDOS(98)](https://github.com/lpproj/fdkernel) の
起動用フロッピーディスクイメージ（2HD）です。FreeDOS(98) カーネル
（[lpproj/fdkernel](https://github.com/lpproj/fdkernel)、branch
`nec98test`、tag `test-20220120-cherrypick`）と FreeCOM DBCS
（[lpproj/freecom_dbcs2](https://github.com/lpproj/freecom_dbcs2)）を組み
合わせたものです。いずれも **GPLv2 以降** の下で配布されているフリーソフト
ウェアであり、本イメージも同ライセンス条件で再配布しています。対応ソースは
上記リポジトリから入手可能です。詳細な由来・ライセンス表記は
`public/freedos/README.txt`（日英併記）を参照してください。

利用者がOSディスクイメージを別途用意しなくてもエミュレータを試せるように
同梱しています。利用方法は3通りです:

- `hdd`/`fd1`/`fd2` を指定せずに開き、起動オーバーレイの
  「FreeDOS(98) で起動」ボタンを押します。
- URLに `?freedos=1` を付けます（`run=1` と併用で自動起動も可能です）。
- 起動後、FDD1スロット横の「FreeDOS(98) 挿入」ボタンを押してからマシンを
  リセットします。

同梱イメージはどの経路から使っても固定キー `freedos:fd98_2hd` で
IndexedDBに永続化されるため、FreeDOS(98) 上での作業（フォーマットや
ファイル保存など）は次回訪問時にも引き継がれ、「初期状態に戻す」で
配布時のイメージに戻せます。

## MCPサーバー (AIエージェントからWebNP2を操作する)

ローカルで動かすMCPサーバー経由で、Claude Code などのAIエージェントから
WebNP2 を操作できます（テキスト画面の読み取り・キー入力・スクリーン
ショット・リセット）。MCPサーバーはあなたのマシン上で動き、
`?bridge=1` パラメータ付きで開いたページ（ローカル/公開ページどちらでも）が
`ws://127.0.0.1` へ接続しに来る構成のため、外部サーバーには何も送信されません。

セットアップ手順は [mcp/README.md](mcp/README.md) にまとまっています。
お使いのAIエージェントに このファイルを示して
「ここに書いてある通りにWebNP2へMCP接続できるようにして」と指示すれば、
そのままセットアップできます。

注意: 公開ページ(https)で使う場合は Chrome系ブラウザ か Firefox を
使ってください（Safari は https ページからの `ws://` 接続を localhost
宛てでもブロックします）。

## 開発方法

```sh
npm install
npm run dev       # 開発サーバー
npm run build     # 型チェック + 本番ビルド (dist/)
npm run preview   # ビルド成果物のプレビュー
```

### コア (public/core/) の更新

`public/core/` には [NP2kai-wasm](../NP2kai) のビルド成果物
(`emnp21kai_sdl2.js` / `.wasm` / `font.bmp` / `LICENSE.NP2kai`) を配置します。
このディレクトリは git 管理対象です（ビルド成果物をリポジトリにコミットする方針）。

コアを再取得・更新する場合:

```sh
scripts/update-core.sh
```

デフォルトでは `/Users/haruurara/MyProject/_emulator/PC98/NP2kai/build` からコピーします。
別の場所からコピーしたい場合は環境変数 `NP2KAI_BUILD_DIR` / `NP2KAI_ROOT_DIR` を指定します。

### 動作確認用ファイル

`public/test/` はローカルでの動作確認用に HDD イメージ等を置く場所です（`.gitignore` で
除外済みで、コミットされません）。

## ライセンス・同梱物について

- 本リポジトリのコード自体のライセンスは特に定めていません（社内ツール）。
- `public/core/` に含まれる NP2kai-wasm のビルド成果物 (`emnp21kai_sdl2.js` /
  `emnp21kai_sdl2.wasm` / `font.bmp`) は NP2kai (BSDライセンス系) のビルド成果物であり、
  ライセンス文は `public/core/LICENSE.NP2kai` を参照してください。
- **PC-98 の ROM イメージ・市販ソフトウェアのディスクイメージは一切同梱していません。**
  `font.bmp` は東雲フォント由来のフォントデータで、著作権上の問題がある PC-98 実機 ROM
  とは別物です。
- `public/freedos/fd98_2hd.xdf` は前述の FreeDOS(98) 起動FDで、GPLv2以降の下で配布しています。
  ソースは [lpproj/fdkernel](https://github.com/lpproj/fdkernel) および
  [lpproj/freecom_dbcs2](https://github.com/lpproj/freecom_dbcs2) から入手可能です。
  詳細は `public/freedos/README.txt` を参照してください。
- ユーザーが `hdd`/`fd1`/`fd2` パラメータや D&D で読み込ませるディスクイメージについては
  各自が適法に入手・使用する責任を負います。

## 実装済みの主な機能

- URL パラメータ読込・fetch進捗表示、ドラッグ&ドロップでのイメージ読込
- IndexedDB による永続化（自動保存・前回状態からの再開・初期化）
- 実行中のFD交換・排出・ブランクFD作成、マシンリセット
- ステートセーブ/復元（IndexedDB 持ち越し）
- スクリーンショット保存（640x400 PNG）
- FreeDOS(98) 同梱起動、`run=1` 自動起動（ミュートバナー付き）
- ディスクイメージのダウンロード、フルスクリーン、日英UI切替
- GitHub Actions による GitHub Pages 自動デプロイ

今後の予定（WebSocket/MCP 連携・スマホUI・AudioWorklet 等）は
[docs/DESIGN.md](docs/DESIGN.md) を参照してください。
