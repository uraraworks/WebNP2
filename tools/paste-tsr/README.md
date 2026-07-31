# paste-tsr — ゲスト常駐ペーストヘルパー (PASTE.COM)

WebNP2 の「テキスト送信(全角)」を NEC MS-DOS でも使えるようにするゲスト側 TSR。
VMware Tools 的なゲスト拡張の位置づけ。

## 背景

NEC MS-DOS の CON ドライバはキーボード入力の 0x80-0x9F を破棄するため、
キーボード BIOS バッファへの注入では Shift_JIS の先行バイトが落ちて全角が化ける
(FreeDOS(98) はこのフィルタが無いため素通し)。

本 TSR は INT 21h の文字入力ファンクション (AH=01/07/08/0A/3F) をフックし、
常駐メモリ内のメールボックス(リングバッファ)から文字を供給する。
CON より上流での注入なので全角がそのまま通る。

## メールボックス構造 (ホストは 'WEBNP2MB' を探す)

| offset | size | 内容 |
|---|---|---|
| +0 | 8 | シグネチャ `WEBNP2MB` |
| +8 | 2 | head (TSR が進める読み出し位置) |
| +10 | 2 | tail (ホストが進める書き込み位置) |
| +12 | 2 | バッファサイズ (256) |
| +14 | 2 | pending (1=ホストが1行を書き込み中) |
| +16 | 2 | installed (常駐時に 0x4B57。ディスクバッファ上の死骸コピー除外用) |
| +18 | 256 | リングバッファ本体 |

ホスト側 API はコアの `webnp2_find_mailbox` / `webnp2_mailbox_space` /
`webnp2_mailbox_put` / `webnp2_mailbox_pending` (NP2kai-wasm sdl/webnp2api.c)。

## ビルド

```sh
nasm -f bin paste.asm -o PASTE.COM
node build-tools-disk.mjs   # → ../../public/tools/webnp2tools.xdf (PC-98 2HD 1232KB FAT12)
```

## 使い方 (ゲスト側)

ツール FD を FD ドライブに挿入して DOS プロンプトで実行 (HDD 起動なら通常 B:):

```
B:PASTE
```

`WebNP2 paste TSR installed.` が出れば常駐完了。二重実行は自動検出する。
毎回が面倒になったら PASTE.COM をゲストの HDD へコピーして AUTOEXEC.BAT に
1行足せば恒久化できる。

## 注意

- DOS が既に入力待ちでブロックしている最中にメールボックスへ書いた場合、
  その入力要求は旧ハンドラ内なので届かない。ホスト側はキーバッファへ CR を
  1つ送って現在の入力を完了させる(WebNP2 の pasteText が自動でやる)。
- INT 18h を直接読むアプリ(FD ファイラー・ゲーム等)には効かない。
  対象は DOS の標準入力 (COMMAND.COM、COPY CON、多くの CUI ツール)。
