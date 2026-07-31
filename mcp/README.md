# webnp2-mcp

WebNP2 (PC-98 エミュレータ Web 版) をブラウザ越しに操作するための MCP サーバーです。
MCP サーバー本体 (stdio transport) と、ブラウザと通信するための WebSocket ブリッジサーバーを
同一の Node.js プロセス内で起動します。

## セットアップ

```sh
cd mcp
npm install
```

## Claude Code への登録

```sh
claude mcp add webnp2 -- node /path/to/WebNP2/mcp/server.mjs
```

`/path/to/WebNP2/mcp/server.mjs` は実際のリポジトリの絶対パスに置き換えてください。

## ブラウザ側の接続

WebNP2 を開く URL に `bridge=1` パラメータを付けると、ページが自動的に
`ws://localhost:3098`（既定ポート）へ接続しに行きます。

```
http://localhost:5173/?freedos=1&run=1&bridge=1
```

ブリッジの WebSocket ポートは環境変数 `WEBNP2_BRIDGE_PORT` で変更できます
（未設定時は `3098`）。ブラウザ側の接続先ポートもそれに合わせてください。

## 提供する MCP ツール

| ツール名 | 概要 |
| --- | --- |
| `screen_text` | 現在のテキスト画面 (80x25) とカーソル位置を取得します。 |
| `type_text` | ASCII 文字列（改行含む）をキーボード入力としてエミュレータに送ります。 |
| `send_keys` | `"ENTER"` や `"CTRL+C"`、`"F1"` のような 1 つのキーコンボを送信します。 |
| `key_code` | スキャンコードと押下/離上を直接指定する低レベルのキー入力です。 |
| `reset` | エミュレータをリセット（再起動）します。 |
| `screenshot` | 画面の PNG スクリーンショットを取得します。 |

ブラウザが未接続の状態でツールを呼び出すと、`?bridge=1` を付けて WebNP2 を開くよう
案内するエラーメッセージが返ります。

## ブリッジ通信仕様（実装済みのブラウザ側を前提）

- ブラウザは接続直後に `{"type":"hello","role":"webnp2"}` を送信します。
- サーバーはコマンドを `{"id":<連番>,"cmd":<string>,"args":<object>}` の形で送信し、
  ブラウザは `{"id":..., "ok":true, "result":...}` または
  `{"id":..., "ok":false, "error":...}` を返します。
- 応答タイムアウトは 15 秒です。
- 複数のブラウザタブが接続した場合、最後に `hello` を送ってきたタブのみが有効になり、
  以前の接続は閉じられます。

## 動作確認

```sh
node --check server.mjs
node server.mjs
```

起動すると stderr に `WebSocket bridge listening on port 3098` のようなログが出力されます。
MCP のログ出力は stdout ではなく stderr に出す実装になっています（stdout は MCP の
stdio transport 専用のためです）。
