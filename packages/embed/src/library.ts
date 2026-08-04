// ライブラリビルドではUI部品のCSSを別成果物として抽出する。
// 公開型の入口はindex.tsに限定し、CSSの副作用importをd.tsへ混ぜない。
import './debugger.css';
export * from './index.ts';
