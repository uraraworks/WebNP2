// ディスクライブラリの一覧構築(グルーピング/並び替え)。
// IndexedDBにフラットに並ぶレコードを、UIが表示するフォルダ付きツリーへ変換する。
// DOM非依存の純粋関数として切り出してあり、単体テスト可能。

import type { StoredImage } from '../storage/db.ts';
import type { LibraryEntry, LibraryNode } from '../ui/types.ts';

/** ディスク以外(ROM/ステート等)を除外するためのプレフィックス。 */
const EXCLUDED_KEY_PREFIXES = ['rom:', 'state:'];

/** ライブラリ一覧の対象になるレコードか(ROM/ステートを除き、拡張子がディスクイメージのもの)。 */
export function isLibraryDiskRecord(
  item: StoredImage,
  classify: (name: string) => 'hdd' | 'fd' | null,
): boolean {
  if (EXCLUDED_KEY_PREFIXES.some((prefix) => item.sourceKey.startsWith(prefix))) return false;
  return classify(item.name) !== null;
}

/**
 * 保存済みレコードをライブラリ一覧のツリーへ変換する。
 * group を持つレコードは1つのフォルダ(group ノード)にまとめ、それ以外は単体(item ノード)にする。
 * フォルダ内はアーカイブ内の出現順(groupIndex)、トップレベルは保存時刻の降順。
 */
export function buildLibraryNodes(
  stored: StoredImage[],
  classify: (name: string) => 'hdd' | 'fd' | null,
): LibraryNode[] {
  const groups = new Map<string, { name: string; entries: LibraryEntry[]; savedAt: number }>();
  const nodes: LibraryNode[] = [];

  for (const item of stored) {
    const kind = classify(item.name);
    if (!kind) continue;
    const entry: LibraryEntry = {
      sourceKey: item.sourceKey,
      name: item.name,
      displayName: item.displayName ?? item.name,
      size: item.bytes.byteLength,
      savedAt: item.savedAt,
      kind,
      group: item.group,
      groupIndex: item.groupIndex,
    };

    if (!item.group) {
      nodes.push({ kind: 'item', entry, savedAt: entry.savedAt });
      continue;
    }

    let group = groups.get(item.group);
    if (!group) {
      group = { name: item.groupName ?? item.group, entries: [], savedAt: 0 };
      groups.set(item.group, group);
    }
    // groupName はグループ内の全レコードが同じ値を持つ前提だが、
    // 一部だけ欠けていた場合に備えて非空の値を優先して採用する。
    if (item.groupName) group.name = item.groupName;
    group.entries.push(entry);
    // フォルダの並び順は「中で最後に保存されたディスク」を基準にする。
    group.savedAt = Math.max(group.savedAt, entry.savedAt);
  }

  for (const [id, group] of groups) {
    group.entries.sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
    nodes.push({ kind: 'group', savedAt: group.savedAt, group: { id, name: group.name, entries: group.entries } });
  }

  nodes.sort((a, b) => b.savedAt - a.savedAt);
  return nodes;
}
