// UI層で共有する型定義のうち、DOMやCSSに依存しないもの。
// player.ts は styles.css を import するため、テストや非UIモジュールからは本ファイルを参照する。

/** ディスクライブラリ(IndexedDB保存済みHDD/FD)の一覧に表示する1件。 */
export interface LibraryEntry {
  sourceKey: string;
  /** 元のファイル名(拡張子含む)。イメージ種別の判定に使うため、リネームしても変わらない。 */
  name: string;
  /** 一覧に出す表示名(リネーム済みならその名前、未設定なら name と同じ)。 */
  displayName: string;
  size: number;
  savedAt: number;
  kind: 'hdd' | 'fd';
  /** 所属グループID(アーカイブ由来の複数ディスク)。単体イメージでは未設定。 */
  group?: string;
  /** グループ内の並び順(アーカイブ内の出現順)。 */
  groupIndex?: number;
}

/** 同一アーカイブから展開された複数ディスクのまとまり(一覧ではフォルダとして表示する)。 */
export interface LibraryGroup {
  id: string;
  name: string;
  entries: LibraryEntry[];
}

/** ライブラリ一覧の行。フォルダ(group)か単体イメージ(item)のどちらか。 */
export type LibraryNode =
  | { kind: 'group'; savedAt: number; group: LibraryGroup }
  | { kind: 'item'; savedAt: number; entry: LibraryEntry };
