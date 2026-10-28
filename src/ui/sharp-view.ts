/**
 * 「シャープ・バイリニア」表示: #canvas(実解像度canvas)の上に重ねる表示専用canvas
 * (WebX68k の src/sharp-view.ts からの移植)。
 *
 * なぜ別canvasを重ねるか:
 * #canvas は実解像度(コアのネイティブ解像度)のピクセルバッファを持つcanvasで、
 * マウス座標換算(canvas.width/clientWidth比)・スクリーンショット(toBlob)・
 * MCP Bridge 等、多数の利用者が「#canvasのバッファ=実解像度そのもの」という前提で
 * アクセスしている。4:3表示やDPRの高い環境では#canvasをCSSで数倍に引き伸ばすため、
 * #canvas自体に中間バッファの仕組みを持ち込むとこれらの前提が壊れる。そこで表示専用の
 * canvas(#canvas-sharp)を#canvasの真上にposition:absoluteで重ね、実際に見える絵は
 * そちらに描く。#canvasのバッファサイズや描画処理(SDL/WebGL)は一切変更しない。
 *
 * なぜ「整数倍(最近傍)→残りは補間」の2段階にするか:
 * 表示先のCSSサイズ(物理ピクセル換算)をそのままバイリニア補間で引き伸ばすと、
 * 表示倍率が2倍3倍と大きいほど画面全体がぼやける(1ドットの境界が何物理pxにも
 * わたって滲む)。先に最近傍(drawImageのimageSmoothingEnabled=false)で物理ピクセル
 * 単位の整数倍(kx, ky)まで引き伸ばした中間バッファを作っておき、それを最後にCSSの
 * 表示サイズへ auto(補間あり)で当てはめる。
 *
 * 整数倍率は「目標(物理表示px)以上になる最小の整数倍」(ceil)を選ぶ。floorだと
 * 例えば1.917倍のような1倍超の端数倍で kx=1 のまま止まってしまい、そこから先は
 * 実質ただのバイリニア拡大になって輪郭がぼやける。ceilにして必ず目標以上へ最近傍で
 * 拡大しておけば、CSS側は「わずかに縮小して合わせる」だけの補間で済み、整数倍で
 * 割り切れる場合(ちょうど2倍など)は従来どおり過不足なくその倍率になる。滲みは
 * ドット境界の1物理px程度に収まり、4:3の非整数倍拡大でも縦横比の配分自体は保った
 * まま、ドットの輪郭は最近傍時よりずっとシャープに見える。
 */

import { corePresentCount } from '../core/module.ts';

/** 中間バッファが大きくなりすぎないための上限(1辺のpx数、および総画素数)。 */
const MAX_PRESCALE_DIMENSION = 8192;
const MAX_PRESCALE_PIXELS = 16_777_216;

/**
 * 実解像度(nativeW x nativeH)を表示先のCSSサイズ(cssW x cssH、DPR適用前)へ
 * 引き伸ばす際に、まず最近傍で拡大しておくべき整数倍率(kx, ky)を求める。
 *
 * kx = ceil(物理表示幅 / 実解像度幅)、ky も同様(物理表示幅 = cssW * dpr)。
 * 目標の物理px以上になる最小の整数倍を選ぶ(整数ちょうどならその値のまま、端数が
 * 出る場合は1つ上の整数倍まで最近傍で拡大し、残りはCSS側の補間でわずかに縮小して
 * 合わせる)。最小1(縮小方向や等倍以下でも最近傍の1倍を確保する)。
 * 中間バッファが1辺8192pxまたは総画素16,777,216pxを超える場合は、kx, kyのうち大きい方から
 * 1ずつ減らして上限内に収める(縦横比が崩れてもよい。上限超過を防ぐことを優先する)。
 */
export function computePrescale(
  nativeW: number,
  nativeH: number,
  cssW: number,
  cssH: number,
  dpr: number,
): { kx: number; ky: number } {
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const physW = cssW * safeDpr;
  const physH = cssH * safeDpr;
  let kx = Math.max(1, Math.ceil(physW / nativeW - 1e-6));
  let ky = Math.max(1, Math.ceil(physH / nativeH - 1e-6));

  while (
    (nativeW * kx > MAX_PRESCALE_DIMENSION ||
      nativeH * ky > MAX_PRESCALE_DIMENSION ||
      nativeW * kx * nativeH * ky > MAX_PRESCALE_PIXELS) &&
    (kx > 1 || ky > 1)
  ) {
    if (kx >= ky) kx = Math.max(1, kx - 1);
    else ky = Math.max(1, ky - 1);
  }

  return { kx, ky };
}

/** カウンタを使えない場合やA/B計測時は従来どおり毎回描く。 */
export function shouldPresent(count: number | undefined, previous: number | undefined, force: boolean, sync: boolean): boolean {
  return !sync || count === undefined || force || count !== previous;
}

/**
 * #canvas の上に重ねる表示専用canvasを管理するクラス。
 * update() でサイズ・表示状態を決め、present() で実際の描画(drawImage)を行う。
 */
export class SharpView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly source: HTMLCanvasElement;
  private readonly sync = new URLSearchParams(location.search).get('sharpsync') !== '0';
  private previousCount: number | undefined;
  private forcePresent = true;
  private sourceWidth = 0;
  private sourceHeight = 0;

  constructor(stageEl: HTMLElement, source: HTMLCanvasElement) {
    this.source = source;
    const canvas = document.createElement('canvas');
    canvas.id = 'canvas-sharp';
    // スクリーンリーダー等には#canvas側だけが実体として見えればよいので隠す。
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    stageEl.appendChild(canvas);
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D コンテキストの取得に失敗しました(#canvas-sharp)');
    this.ctx = ctx;
  }

  /**
   * 表示状態を更新する。active=false(4:3でもDPRスムーズ対象でもない、通常のドット等倍表示)
   * なら非表示にして#canvas自体をそのまま見せる。true ならcomputePrescale()で中間サイズを
   * 決め、CSS表示サイズ(cssW x cssH)へ重ねる。
   *
   * 中間サイズが変わったときだけ canvas.width/height を代入する(width/height への代入は
   * 実装上キャンバスの中身を破棄してしまうため、変化がないのに毎回代入すると不要に
   * 中身が消えてちらつく)。
   *
   * present() はコアの描画回数が変わったとき、または表示状態やサイズの変更時に描く。
   */
  update(active: boolean, cssW: number, cssH: number, dpr: number): void {
    if (!active) {
      this.canvas.hidden = true;
      return;
    }

    const nativeW = this.source.width || 1;
    const nativeH = this.source.height || 1;
    const { kx, ky } = computePrescale(nativeW, nativeH, cssW, cssH, dpr);
    const bufW = nativeW * kx;
    const bufH = nativeH * ky;

    if (this.canvas.hidden) this.forcePresent = true;
    if (this.canvas.width !== bufW || this.canvas.height !== bufH) {
      this.forcePresent = true;
      this.canvas.width = bufW;
      this.canvas.height = bufH;
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.hidden = false;
    this.present();
  }

  /** 現在有効(表示中)かどうか。rAFループ側が無駄なpresent()を避けるために参照する。 */
  isActive(): boolean {
    return !this.canvas.hidden;
  }

  /**
   * source(#canvas)の現在の中身を、最近傍で中間バッファへ描き直す。
   * source.width/height が0(コア未起動など)のときは何もしない。
   * 中間バッファのサイズ計算に使ったnativeサイズとsourceの現在サイズが解像度変化直後で
   * 食い違っていても、drawImageはsourceの全域を中間バッファ全面へ描くだけなのでそのまま
   * 使ってよい(直後にrescale()経由でupdate()が呼ばれ、正しいサイズへ再計算される)。
   */
  present(): void {
    if (this.canvas.hidden) return;
    if (this.source.width === 0 || this.source.height === 0) return;
    if (this.sourceWidth !== this.source.width || this.sourceHeight !== this.source.height) {
      this.forcePresent = true;
    }
    const count = this.sync ? corePresentCount() : undefined;
    if (!shouldPresent(count, this.previousCount, this.forcePresent, this.sync)) return;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(
      this.source,
      0,
      0,
      this.source.width,
      this.source.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    this.previousCount = count;
    this.forcePresent = false;
    this.sourceWidth = this.source.width;
    this.sourceHeight = this.source.height;
  }
}
