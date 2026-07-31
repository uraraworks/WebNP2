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
