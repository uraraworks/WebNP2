# webnp2-mcp — WebNP2 を AI から操作する MCP サーバー

WebNP2 (PC-98 エミュレータ Web 版) をブラウザ越しに操作するための MCP サーバーです。
MCP サーバー本体 (stdio transport) と、ブラウザと通信するための WebSocket ブリッジサーバーを
同一の Node.js プロセス内で起動します。

エミュレータ本体はブラウザ内で動き、この MCP サーバーは常に**あなたのマシン上**で動きます。
ページの JavaScript が `ws://127.0.0.1:<ポート>` へ接続しに来る構成のため、
ページをローカル開発サーバーで開いても、公開ページ
(https://uraraworks.github.io/WebNP2/) で開いても同じように使えます。
ディスクイメージや画面の内容が外部サーバーへ送られることはありません。

## セットアップ手順（Claude Code 等の AI エージェントはこの節をそのまま実行すればよい）

前提: Node.js 18 以上と git がインストールされていること。

1. リポジトリを取得して依存をインストールする:

   ```sh
   git clone https://github.com/uraraworks/WebNP2.git
   cd WebNP2/mcp
   npm install
   ```

   （既にクローン済みなら `cd <クローン先>/mcp && npm install` のみ）

2. MCP サーバーとして登録する。`<絶対パス>` はクローン先の実パスに置き換えること:

   ```sh
   claude mcp add webnp2 -- node <絶対パス>/WebNP2/mcp/server.mjs
   ```

   Claude Code 以外の MCP クライアントの場合は、stdio transport で
   `node <絶対パス>/WebNP2/mcp/server.mjs` を起動する設定を追加する。

3. ブラウザで WebNP2 を `bridge=1` パラメータ付きで開く（どちらでもよい）:

   - 公開ページ: `https://uraraworks.github.io/WebNP2/?freedos=1&run=1&bridge=1`
   - ローカル: `http://localhost:5173/?freedos=1&run=1&bridge=1`
     （リポジトリ直下で `npm install && npm run dev`）

   `freedos=1&run=1` は同梱 FreeDOS(98) での自動起動。自分のディスクイメージを使う場合は
   ページの UI から挿入するか `?hdd=`/`?fd1=` パラメータを使う。

4. 動作確認: MCP クライアントから `screen_text` ツールを呼び、画面テキスト
   （FreeDOS なら `A:\>` プロンプト）が返れば接続完了。

### 注意事項

- **Safari 非対応（公開ページ利用時）**: https ページから `ws://127.0.0.1` への接続は
  Chrome / Edge / Firefox ではローカルホスト例外で許可されるが、Safari はブロックする。
  公開ページ + MCP の組み合わせは Chrome 系ブラウザを使うこと。
  ローカル (http://localhost) で開く場合はどのブラウザでも動く。
- ブリッジの WebSocket ポートは環境変数 `WEBNP2_BRIDGE_PORT` で変更できる（既定 `3098`）。
  変更した場合はブラウザ側も `?bridge=<ポート番号>` で合わせる。
  `?bridge=` には `1`（既定ポート）/ ポート番号 / `ws://` URL のいずれかを指定できる。
- ブラウザが未接続の状態でツールを呼ぶと、`?bridge=1` を付けて WebNP2 を開くよう
  案内するエラーが返る。
- 複数タブが接続した場合、最後に接続したタブのみ有効（古い接続は閉じられる）。

## 提供する MCP ツール

| ツール名 | 概要 |
| --- | --- |
| `screen_text` | 現在のテキスト画面 (80x25) とカーソル位置を取得します。漢字も読めます。 |
| `type_text` | ASCII 文字列（改行含む）をキーボード入力としてエミュレータに送ります。 |
| `paste_text` | キーボードBIOSバッファ注入でテキストを貼り付けます。**全角(Shift_JIS)対応**。ゲスト側FEP不要。改行はEnter。※全角が届くのは FreeDOS(98) など DBCS 対応の入力先のみ。NEC MS-DOS の CON はキーボード入力の 0x80-0x9F を破棄するため漢字は化けます(半角カナ/ASCIIは可)。 |
| `send_keys` | `"ENTER"` や `"CTRL+C"`、`"F1"` のような 1 つのキーコンボを送信します。 |
| `key_sequence` | press/down/up/wait/text/paste を組み合わせたキーマクロを順番に実行します。操作手順の再現やキー長押し・押しっぱなしに使えます。 |
| `key_code` | スキャンコードと押下/離上を直接指定する低レベルのキー入力です。 |
| `reset` | エミュレータをリセット（再起動）します。 |
| `screenshot` | 画面の PNG スクリーンショットを取得します。 |
| `wait_screen` | 画面に指定文字列が現れるまでポーリングして待ちます。固定sleepの代わりに使います。 |
| `setup_paste_helper` | ゲストにペースト用TSR(PASTE.COM)入りツールFDを挿入・実行します。成功後は NEC MS-DOS でも paste_text が全角対応になります。 |
| `save_state` | 現在の実行状態を名前付きスロットへスナップショット保存します。危険な操作の前に保存しておけば `load_state` で巻き戻せます。 |
| `load_state` | 指定スロットに保存済みの実行状態を復元します。未保存のスロットを指定するとエラーになります。 |
| `list_states` | 保存済みステートスロットの一覧を保存日時とともに返します。 |
| `wait_screen_change` | 画面が変化し、その後落ち着くまでポーリングして待ちます。ロード完了やコマンド終了など、待つべき文字列が分からない場合に使います。文字列が分かっている場合は `wait_screen` の方が確実です。 |
| `mouse_move` | マウスポインタを画面座標(0-639, 0-399)へ移動します。初回は自動で左上へホーミングして基準を作ります。座標はホスト側推定値なので、ズレたら `mouse_home` でやり直してください。 |
| `mouse_click` | マウスクリックを送ります。x/y指定があれば先に移動します。button既定left、countで連続クリック(最大3)。 |
| `mouse_drag` | 指定区間をドラッグします(移動→押下→移動→解放)。button既定left。 |
| `mouse_home` | マウスを左上へ再ホーミングし、座標の基準を作り直します。 |
| `find_text` | 画面テキストから文字列を検索し、行・列位置を返します。 |
| `click_text` | 画面上の文字列を探してそこをクリックします。テキスト画面のメニュー項目クリックに便利です。グラフィック画面上の文字には効きません。 |
| `list_disks` | 現在マウント中のディスク一覧(hdd/fd1/fd2)を名前・sourceKey付きで返します。 |
| `list_disk_library` | ブラウザ(IndexedDB)に保存済みのディスクイメージ一覧を返します。sourceKeyは `insert_disk` に使えます。 |
| `insert_disk` | FD1/FD2へディスクを挿入します。`url`(CORS対応のfetch元)・`source_key`(ライブラリから)・`blank`(未フォーマットの空FD、要DOS FORMAT)のいずれか1つを指定します。 |
| `eject_disk` | FD1/FD2からディスクを排出します。排出前に自動でIndexedDBへ保存されます。 |
| `export_disk` | マウント中のイメージをbase64で取得します。5MB超はエラーになるため、HDDのような大きなイメージはUIのダウンロードボタンを使ってください。 |
| `persist_disks` | マウント中イメージの変更を即座にIndexedDBへ保存します。定期自動保存や排出を待たずに使えます。 |
| `disk_list_files` | FD1/FD2にマウント中のディスクイメージ(FAT12/16)内のファイル一覧と空き容量を、ゲストOSを介さず直接読み取ります。HDDは未対応、ファイル名は8.3形式のみ。 |
| `disk_read_file` | ディスクイメージ内のファイルを直接読み出します。既定はテキスト(Shift_JISとしてデコード)、`encoding:"base64"`でバイナリも取得できます。 |
| `disk_write_file` | ディスクイメージ内へファイルを新規作成/上書きします。`content`(Shift_JISエンコードされるテキスト)か`base64`のどちらか一方を指定します。**書き込み後は自動でドライブを排出→再挿入しDOS側キャッシュを破棄させるため、ゲストがそのドライブへアクセス中でないタイミングで実行すること。** |
| `disk_delete_file` | ディスクイメージ内のファイルを削除します。削除後も自動で排出→再挿入します。同様にゲストの書き込み中を避けること。 |
| `put_file` | ホストのテキスト/バイナリを転送用FD経由でゲストの任意ドライブ(HDD含む)へ配置します。転送用FDへ書いてからゲストDOSに`COPY`させる複合ツールで、**HDDイメージをホストが直接書き換えないためDOS側キャッシュと衝突せず安全です。HDDへの書き込みはこの経路を使うこと。** `path`はゲスト側の宛先フルパス(例`A:\WORK\FOO.TXT`)、ファイル名は8.3形式のみ。DOSプロンプト待ち状態で実行すること。 |
| `get_file` | ゲストの任意ドライブ(HDD含む)上のファイルを転送用FD経由でホストへ取り出します。ゲストDOSに`COPY`させてからホストがFDを直接読む複合ツールで、**HDDからの読み出しもこの経路を使うのが安全です。** DOSプロンプト待ち状態で実行すること。 |

使用例（AI への指示イメージ）:
「screen_text で画面を確認して、type_text で `dir` と改行を打ち、結果を要約して」

## ブリッジ通信仕様

- ブラウザは接続直後に `{"type":"hello","role":"webnp2"}` を送信します。
- サーバーはコマンドを `{"id":<連番>,"cmd":<string>,"args":<object>}` の形で送信し、
  ブラウザは `{"id":..., "ok":true, "result":...}` または
  `{"id":..., "ok":false, "error":...}` を返します。
- 応答タイムアウトは 15 秒です。

## 動作確認（開発者向け）

```sh
node --check server.mjs
node server.mjs
```

起動すると stderr に `WebSocket bridge listening on port 3098` のようなログが出力されます。
MCP のログ出力は stdout ではなく stderr に出す実装になっています（stdout は MCP の
stdio transport 専用のためです）。
