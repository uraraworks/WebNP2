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
 * `?lib=<url>` パラメータで取得・ライブラリ登録したディスクイメージ群を、
 * 呼び出し側(main.ts)がどう扱うか(スロットへは挿入せず、ライブラリを開くだけ)決めるための
 * 枚数分岐。fd1/fd2/hdd 用の finishArchiveImages と異なり種別(hdd/fd)チェックは行わない
 * (HDD/FD混在のZIPもそのまま登録できるようにするため。スロットへ挿入する時点で
 * 既存の種別チェックが効くので安全性は変わらない)。
 */
export type LibUrlOutcome =
  | { kind: 'empty' }
  | { kind: 'single'; sourceKey: string }
  | { kind: 'group'; groupId: string };

export function classifyLibUrlResult(images: Array<{ sourceKey: string }>, groupId: string): LibUrlOutcome {
  if (images.length === 0) return { kind: 'empty' };
  if (images.length === 1) return { kind: 'single', sourceKey: images[0].sourceKey };
  return { kind: 'group', groupId };
}

/**
 * 名前の比較に使う共有コンパレータ。
 * numeric:true が肝で、"DISK2" と "DISK10" を数値として比較するため
 * DISK2 < DISK10 になる(通常の辞書順だと "1" < "2" 判定になり DISK10 < DISK2 になってしまう)。
 */
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** name によるソート。0(同名)の場合は tieBreakKey で決定的にタイブレークする。 */
function compareByName(nameA: string, nameB: string, tieBreakKeyA: string, tieBreakKeyB: string): number {
  const byName = nameCollator.compare(nameA, nameB);
  if (byName !== 0) return byName;
  return tieBreakKeyA < tieBreakKeyB ? -1 : tieBreakKeyA > tieBreakKeyB ? 1 : 0;
}

/**
 * 保存済みレコードをライブラリ一覧のツリーへ変換する。
 * group を持つレコードは1つのフォルダ(group ノード)にまとめ、それ以外は単体(item ノード)にする。
 *
 * 並び順はすべて名前順(Intl.Collator の numeric 照合)。
 * フォルダ内は displayName の名前順、トップレベルはフォルダを先・単体を後にしたうえで
 * それぞれ グループ名/displayName の名前順にする。groupIndex・savedAt はフィールドとしては
 * 残すが並び替えには使わない。numeric 照合にしているのは "DISK2" と "DISK10" を辞書順で
 * 比較すると DISK10 が DISK2 より前に来てしまうため。
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
    group.entries.sort((a, b) => compareByName(a.displayName, b.displayName, a.sourceKey, b.sourceKey));
    nodes.push({ kind: 'group', savedAt: group.savedAt, group: { id, name: group.name, entries: group.entries } });
  }

  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1;
    const nameA = a.kind === 'group' ? a.group.name : a.entry.displayName;
    const nameB = b.kind === 'group' ? b.group.name : b.entry.displayName;
    const keyA = a.kind === 'group' ? a.group.id : a.entry.sourceKey;
    const keyB = b.kind === 'group' ? b.group.id : b.entry.sourceKey;
    return compareByName(nameA, nameB, keyA, keyB);
  });
  return nodes;
}
