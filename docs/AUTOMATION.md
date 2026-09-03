# WebNP2 を自動操作する

ページ内 JavaScript から WebNP2 を操作するための API 一覧です。
測定・回帰テスト・AI エージェントからの操作を想定しています。

MCP サーバー経由で操作する場合は [`mcp/README.md`](../mcp/README.md) を参照してください。
この文書が扱うのは、その下にある **ページ内 JS の API** です。

## 入口

`window.np2debug` がページ読み込み時に無条件で公開されます（`bridge=1` は不要）。

```js
window.np2debug.np2                 // WebNP2 インスタンス。以下の全メソッドを持つ
await window.np2debug.call(cmd, args)  // Bridge のコマンドを名前で実行する
```

コアが起動していない間は、ほとんどのメソッドが `Error('not booted')` を投げます。
`np2.isBooted()` で確認してください。

## キー入力

**入力経路は2つあり、測るものによって使い分けが必要です。**

| API | 何をするか | 使いどころ |
|---|---|---|
| `np2.sendKey(code, down)` | **PC-98 スキャンコードを注入**する | キーコードの測定、修飾キーの押しっぱなし |
| `Module._webnp2_push_key_buffer(ch)` | BIOS のキーバッファへ**文字コードを直接積む** | コマンドを打ち込むだけの用途 |

`push_key_buffer` はスキャンコードの変換経路を通らないため、**キーボード BIOS が返す
スキャンコードは 0 になります。** キー周りを測るときは必ず `sendKey` を使ってください。

**長い文字列を一度に押し込まないでください。** PC-98 の BIOS キーバッファは
**16件しか入らず、超えた分は黙って捨てられます**。20文字のコマンドを一度に送ると
途中が欠けて、別のコマンドと混ざった形で実行されます。10文字程度ずつに分けて、
消費されるのを待ってから次を送ってください（`np2.typeText()` はこれを考慮しています）。

**ブラウザの合成キーイベント（`dispatchEvent` による KeyboardEvent）は届きません。**
WebNP2 のキー処理が `e.code` を見ており、合成イベントでは空になるためです。
自動操作から実キー相当を入れる手段は `sendKey` です。

```js
const np2 = window.np2debug.np2;
np2.sendKey(0x1D, true);    // 'a' のスキャンコードを押す
np2.sendKey(0x1D, false);   // 離す

await np2.sendKeys('CTRL+C');       // コンボ。'+'区切りの最後がメインキー
await np2.typeText('DIR\r');        // 文字列を打ち込む
await np2.runKeySequence([          // 押しっぱなしを含むマクロ
  { type: 'down', keys: 'SHIFT' },
  { type: 'press', keys: 'A', holdMs: 100 },
  { type: 'up',   keys: 'SHIFT' },
]);
```

`runKeySequence` のステップは `press` / `down` / `up` / `wait` / `text` / `paste`。
例外が出ても、押しっぱなしのキーは finally で必ず離されます。
1ステップ最大10秒、シーケンス全体で60秒を超えると Error になります。

## 画面を読む

| API | 返るもの |
|---|---|
| `np2.getScreenText()` | `{ text, lines[], cursor }`。Shift_JIS へ変換した**文字列** |
| `Module.ccall('webnp2_read_tvram', ...)` | TVRAM のセル配列（下記） |
| `gl.readPixels(...)` | **実際に描画されたピクセル** |

用途に応じて選びます。**上ほど加工されており、下ほど生に近いです。**

```js
// 文字列として読む(いちばん手軽)
const s = np2.getScreenText();
console.log(s.lines[0], s.cursor);   // { row, col } / 非表示なら null
```

```js
// セル配列として読む。b[0]=桁数 b[1]=行数 b[2..3]=カーソルセル番号(int16, -1=非表示)
// b[4..] が 2byte LE のセル配列。0x0000-0x00FF=ANK / 上位!=0 は全角
const M = window.Module;
// HEAPU8 は Module に生えていないビルドがあります。グローバルへフォールバックしてください
// (実装側の getHeapU8() と同じ扱い)。M.HEAPU8 決め打ちだと undefined.slice で落ちます。
const heap = window.Module?.HEAPU8 ?? window.HEAPU8;
const ptr = M.ccall('webnp2_read_tvram','number',[],[]);
const n   = M.ccall('webnp2_tvram_size','number',[],[]);
const b   = heap.slice(ptr, ptr + n);
```

**全角文字は `[JISコード][0x0000]` の2セルを占めます。** 1セル目に JIS X 0208 のコードが入り、
2セル目は 0 です。ANK は `0x0000`-`0x00FF` に収まります。

`read_tvram` は **WebNP2 側のデコーダを通した値**で、生バイトではありません。
**属性（色・反転・下線）は含まれません。** 属性や実際の描画を確かめるには
ピクセルを読んでください。

**桁数・行数は画面モードに追従します**（25行モードなら 25、20行モードなら 20）。
バッファは最大サイズ固定でセルは報告された `cols*rows` に詰めて入るため、
**必ずヘッダの桁数・行数を読んでから走査してください。** 80x25 を決め打ちにしないこと。

**画面の幾何（行数・桁数・文字の大きさ）を確かめたいときはピクセルで測ってください。**
かつてこの値は固定で 80x25 を返しており、モード切替が自動操作から見えず、
測定で誤った結論を出したことがあります（2026-08-24 に修正）。

```js
// 描画されたピクセルを読む
const c  = document.getElementById('canvas');
const gl = c.getContext('webgl2') || c.getContext('webgl');   // 2d は null が返る
const buf = new Uint8Array(w * h * 4);
gl.readPixels(x, 400 - 1 - yBottom, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
```

- **canvas は WebGL です。** `getContext('2d')` が null を返すので `getImageData` は使えません
- readPixels の原点は左下なので y を反転します
- 画面は 640x400、1セルは 8x16 ちょうど（80桁 x 25行）

画面の変化を待つには `np2.waitScreenChange()` / `np2.waitScreenText(contains, timeoutMs)`、
文字列の位置を探すには `np2.findScreenText(needle)` / `np2.clickScreenText(needle)` が使えます。

## メモリを読み書きする

```js
const m = np2.readMemoryBase64(0xA0000, 8);   // { addr, len, base64 }
np2.writeMemoryBase64(0xA0000, base64);       // CPU 停止中の利用が前提
```

**測定プログラムに画面表示を書かなくても、結果をメモリから直接回収できます。**
ゲスト側は既知の番地へ書くだけでよく、表示コードのバグが測定を汚しません。

## デバッガ

```js
np2.dbgSetPaused(true);            // 停止 / dbgIsPaused()
np2.dbgStep(1);                    // ステップ実行
np2.dbgReadRegs();                 // eax..gs, eip, eflags, cr0
np2.dbgDisasm(seg, off, count);    // 逆アセンブル
np2.dbgSetBreakpoint(i, seg, off, enabled);
np2.dbgRunUntilBreakpoint(maxSteps);
```

## ディスク

```js
np2.listDisks();                                  // マウント中の一覧
await np2.insertFdFromUrl(1, url);                // drive 1=A:, 2=B:
await np2.waitForFddReady(1);                     // 挿入後の待ち(下記)
await np2.ejectFd(1);
await np2.exportDiskBase64('fd1');
await np2.diskListFiles('fd1', '');               // FAT を直接操作
await np2.diskReadFile('fd1', path);
await np2.diskWriteFile('fd1', path, data);
await np2.putFileToGuest({...});                  // ゲストへファイルを送る
await np2.getFileFromGuest({...});
```

- **FD 差し替え直後は Not Ready を返します。** 挿入遅延20フレーム（実機の模倣）が
  あるため、**壁時計で待つのではなく** `waitForFddReady()` を使ってください
- **FD を指定すると HDD から起動しません。** PC-98 の IPL が FD を先に見るためで、
  起動できない FD が入っているだけで止まります。測定用プログラムは HDD 側へ置くのが確実です
- **コアは1回しか boot できません。** やり直しはページごとリロードしてください

## 状態の保存

```js
await np2.saveState(); await np2.loadState();
await np2.saveStateSlot(name); await np2.loadStateSlot(name); await np2.listStateSlots();
```

## その他の観測

```js
// webnp2_disk_access() は [fdd1..fdd4, hdd] の累積アクセス回数配列の「先頭ポインタ」を返します。
// webnp2_disk_access_count() は要素数(常に5)を返すだけで、アクセス回数そのものではありません。
const M = window.Module;
const heap = window.Module?.HEAPU8 ?? window.HEAPU8;
const ptr   = M.ccall('webnp2_disk_access', 'number', [], []);
const count = M.ccall('webnp2_disk_access_count', 'number', [], []);   // 常に5
const view  = new Uint32Array(heap.buffer, ptr, count);
const counters = { fdd: Array.from(view.subarray(0, count - 1)), hdd: view[count - 1] };
```

「起動が遅い」のか「そもそも読みに行っていない」のかを切り分けられます。

## サウンド

```js
M.ccall('webnp2_seeksnd_set', null, ['number'], [on ? 1 : 0]);   // FDDシーク音のON/OFF
M.ccall('webnp2_seeksnd', 'number', [], []);                     // 現在値(0/1)を取得
```

`np2cfg.MOTOR` を書き換えるだけで、fdc.c がシークのたびに参照するため即座に反映されます。
再起動やディスク差し替えを挟む必要はありません。

## ポーズ

```js
M.ccall('webnp2_dbg_set_paused', null, ['number'], [1]);          // 停止/再開
M.ccall('webnp2_dbg_paused', 'number', [], []);                   // 現在値(0/1)
M.ccall('webnp2_set_pause_sleep_ms', null, ['number'], [200]);    // ポーズ中ループの待ち時間(0〜1000, クランプ)
M.ccall('webnp2_pause_sleep_ms', 'number', [], []);                // 現在値(既定33ms)
M.ccall('webnp2_dbg_step', 'number', ['number'], [1]);            // 停止中に指定命令数を実行
```

**`webnp2_dbg_set_paused()` と `webnp2_dbg_step()` は、呼ぶたびにポーズ中の待ち時間を既定の
33msへ戻します。** 待ち時間を明示的に指定したい場合は、`set_paused`/`step` を呼んだ**あと**に
`webnp2_set_pause_sleep_ms()` を呼んでください。逆順だと直後に33msへ巻き戻されます。

## Bridge コマンド

`window.np2debug.call(cmd, args)` で名前指定でも実行できます。
MCP サーバーが呼ぶのと同じ入口です。

```
ping screen_text type_text paste_text wait_screen setup_paste_helper
send_keys key_sequence key reset screenshot save_state load_state list_states
wait_screen_change mouse_move mouse_click mouse_drag mouse_home
find_text click_text list_disks list_disk_library insert_disk eject_disk
export_disk persist_disks disk_list_files disk_read_file disk_write_file
disk_delete_file put_file read_memory get_file
```

## 落とし穴

- **ブラウザのタブ／ペインを前面から外すとエミュレータが止まります。**
  `requestAnimationFrame` が回らなくなるためで、自動操作側からは「応答しない」ようにしか見えません
- **ポーズ中は `typeText` 等のキー入力が進みません。** コア自体が止まっているため、
  キーバッファへ積んでも消費されません。自動操作からポーズを使うときは、操作前に必ず
  再開するか、ポーズ前に必要な入力を済ませてください
- **`webnp2_dbg_set_paused()` はポーズ中の待ち時間を既定の33msへ戻します。** 待ち時間を
  指定したいときは `set_paused` の**後**に `webnp2_set_pause_sleep_ms()` を呼んでください
- **フルスクリーンのファイラ/アプリはキーバッファを読まないことがあります。**
  `push_key_buffer` で入れてもカウンタが減らず、自動操作で終了させられません。`sendKey` を使ってください
- **`/@fs/...` 形式の URL はディスク指定に使えません。** 中継サーバーが URL を解釈できず失敗します。
  `public/test/` は gitignore 済みなので、そこへ symlink を置いて `?hdd=./test/xxx.thd` と渡してください
- ディスクイメージを差し替えたときは、**URL のファイル名も変えて**キャッシュを避けてください

---

**動作確認:** 2026-08-24 / WebNP2 `327d061`。
`sendKey` `readMemoryBase64` `getScreenText` `dbgReadRegs` `listDisks` `read_tvram` `readPixels`
は実際に呼び出して返り値を確認済み。それ以外はソース上の定義に基づく記載です。

**動作確認:** 2026-09-03 / WebNP2 `a783e0a`。
`webnp2_seeksnd` `webnp2_seeksnd_set` `webnp2_pause_sleep_ms` `webnp2_dbg_paused`
`webnp2_dbg_set_paused` `webnp2_dbg_step` `webnp2_disk_access` `webnp2_disk_access_count`
は実際に呼び出して返り値を確認済み。それ以外はソース上の定義に基づく記載です。
