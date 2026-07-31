FreeDOS(98) bundled boot floppy image / 同梱している起動FDイメージについて
==========================================================================

[English]

fd98_2hd.xdf is a 2HD (1.25MB) flat floppy disk image of "FreeDOS(98)", a
port of FreeDOS (an MS-DOS-compatible operating system) for the NEC
PC-9801/9821 series.

This image bundles:
- FreeDOS(98) kernel (kernel.sys), from the "lpproj/fdkernel" project
  https://github.com/lpproj/fdkernel
  branch: nec98test, tag: test-20220120-cherrypick
  (downloaded as fd98_2hd144_20220123.zip from the "test-20220120-cherrypick"
  release, file fd98_2hd.img, renamed to fd98_2hd.xdf for this project)
- FreeCOM DBCS (command.com), from the "lpproj/freecom_dbcs2" project
  https://github.com/lpproj/freecom_dbcs2

Both are free software licensed under the GNU General Public License
version 2 or later (GPLv2+). This image is redistributed under the same
terms. The complete corresponding source code is available from the
GitHub repositories linked above (see each repository's releases / tags
for the exact revisions used); no source code has been modified for this
bundling, only the disk image file has been renamed.

This bundled image contains no NEC PC-98 ROM data and no commercial
software. It is provided purely as a convenience so that visitors can try
the emulator without needing to obtain an OS disk image themselves. Use
it with the WebNP2 player via the "Start with FreeDOS(98)" overlay
button, the `?freedos=1` URL parameter, or the "Insert FreeDOS(98)"
button on the FDD1 slot.

See READMEja.htm in this project's dev scratch area (or the upstream
repositories above) for the original Japanese documentation from the
FreeDOS(98) distribution.


[日本語]

fd98_2hd.xdf は、MS-DOS互換OS「FreeDOS」をNEC PC-9801/9821シリーズ向けに
移植した「FreeDOS(98)」の起動用フロッピーディスクイメージ（2HD/1.25MB、
ベタイメージ）です。

本イメージの構成:
- FreeDOS(98) カーネル (kernel.sys) — 「lpproj/fdkernel」プロジェクトより
  https://github.com/lpproj/fdkernel
  branch: nec98test, tag: test-20220120-cherrypick
  （"test-20220120-cherrypick" リリースの fd98_2hd144_20220123.zip に含まれる
  fd98_2hd.img を取得し、本プロジェクトでは fd98_2hd.xdf にリネームして使用）
- FreeCOM DBCS (command.com) — 「lpproj/freecom_dbcs2」プロジェクトより
  https://github.com/lpproj/freecom_dbcs2

いずれも GNU General Public License version 2 or later（GPLv2+）の下で
配布されているフリーソフトウェアであり、本イメージも同ライセンス条件の下で
再配布しています。対応するソースコードは上記GitHubリポジトリから入手可能
です（使用した具体的なリビジョンは各リポジトリのリリース/タグを参照してく
ださい）。本同梱にあたりソースコードへの変更は行っておらず、ディスクイメー
ジファイル名のリネームのみ行っています。

本イメージにPC-98実機のROMデータや市販ソフトウェアは一切含まれていません。
エミュレータを試す際にOSディスクイメージを別途用意しなくても済むよう、
利便性のために同梱しているものです。WebNP2プレイヤーからは、オーバーレイの
「FreeDOS(98) で起動」ボタン、URLパラメータ `?freedos=1`、FDD1スロットの
「FreeDOS(98) 挿入」ボタンから利用できます。

FreeDOS(98) 配布元オリジナルの日本語READMEについては、上記リポジトリの
リリースページ等を参照してください。
