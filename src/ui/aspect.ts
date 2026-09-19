/**
 * 表示縦横比モードの判定と「目標サイズ」計算。DOM に一切触れない純関数として player.ts から
 * 切り出した(WebX68k の src/aspect.ts からの移植)。理由: Node環境(vitest)から import して
 * ロジック自体を検証できるようにするため。
 */
export type AspectMode = 'native' | '4:3';

/**
 * localStorage から読んだ生の値(未設定なら null)を、実際に使う AspectMode に解決する。
 * 既定は「4:3」(実機モニタ相当)。PC-98実機は解像度に関わらず4:3ブラウン管いっぱいに表示する
 * ため、640x400/640x200 のようなドット等倍(正方形ピクセル)表示は実機より縦が詰まって見える。
 * 'native'(ドット等倍) はメニューから明示的に選ぶオプションとして残す。
 * 既に明示的に 'native'/'4:3' を選んで保存済みの値があれば、それを尊重して上書きしない
 * (保存はボタン操作時のみ行われ、URL の ?aspect= による起動時の一時上書きは保存されない)。
 */
export function resolveAspectMode(savedValue: string | null): AspectMode {
  if (savedValue === '4:3' || savedValue === 'native') return savedValue;
  return '4:3';
}

/** `?aspect=` の値をパースする。'4:3'/'native' 以外(未指定・不正値含む)は null。 */
export function parseAspectModeParam(raw: string | null): AspectMode | null {
  if (raw === '4:3' || raw === 'native') return raw;
  return null;
}

/*
 * ==== 4:3表示モード ====
 * 実機は解像度に関わらず4:3のモニタいっぱいに表示されるため、コアの実解像度をそのまま
 * ドット等倍(正方形ピクセル)で描くと実機と縦横比が違う。'4:3' モードでは実解像度を
 * 4:3に補正した「目標サイズ」を計算し、そこへフィットさせる(getTargetSize() 参照)。
 *
 * 補正は必ず「拡大方向」で行う。どちらの軸も縮小してはいけない
 * (どちらか一方でも実解像度を下回ってはいけない)。
 *   - アスペクト比 < 4/3 (640x480 より縦長になることは無いが念のため対応) → 縦(高さ)を保ち、
 *     横を height*4/3 へ広げる
 *   - アスペクト比 > 4/3 (640x400, 640x200 等) → 横(幅)を保ち、縦を width*3/4 へ伸ばす
 *   - ちょうど 4/3 (640x480) → 変化なし
 * 理由: canvas は styles.css で image-rendering: pixelated(最近傍補間)にしている。
 * 縮小方向で4:3化すると、1ドット幅の縦線(テキスト画面の文字など)が間引かれて消え、
 * 実機で文字が潰れて読めなくなる不具合をWebX68k側で実際に踏んだ(2026-08 報告)。
 * 非整数倍の拡大になる分、行や列が不均等に複製される粗さは残るが、
 * ドットが消えて読めなくなるよりはるかにマシなので、今後もこの縮小禁止方針を崩さないこと。
 */

/**
 * 指定した表示縦横比モードでの「目標サイズ」(この比率でウィンドウ/フルスクリーンに収める)。
 * '4:3' モードでは常に拡大方向で補正する(上のコメントブロック参照。縮小は不可)。
 */
export function getTargetSize(
  mode: AspectMode,
  nativeWidth: number,
  nativeHeight: number,
): { width: number; height: number } {
  if (mode === '4:3') {
    if (nativeWidth * 3 < nativeHeight * 4) {
      // アスペクト比 < 4/3: 縦を保ち、横を広げる
      return { width: (nativeHeight * 4) / 3, height: nativeHeight };
    }
    if (nativeWidth * 3 > nativeHeight * 4) {
      // アスペクト比 > 4/3: 横を保ち、縦を伸ばす
      return { width: nativeWidth, height: (nativeWidth * 3) / 4 };
    }
    // ちょうど 4/3: 変化なし
    return { width: nativeWidth, height: nativeHeight };
  }
  return { width: nativeWidth, height: nativeHeight };
}
