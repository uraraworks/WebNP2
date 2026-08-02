import { describe, expect, it } from 'vitest';
import { buildLibraryNodes, isLibraryDiskRecord } from '../src/api/library.ts';
import type { StoredImage } from '../src/storage/db.ts';

const HDD_EXTENSIONS = ['.thd', '.hdi', '.nhd', '.hdd'];
const FD_EXTENSIONS = ['.d88', '.fdi', '.xdf', '.dup', '.fdd', '.hdm'];

/** player.ts の classifyDroppedFile と同じ判定(テストからDOM依存モジュールを読まないための複製)。 */
function classify(name: string): 'hdd' | 'fd' | null {
  const lower = name.toLowerCase();
  if (HDD_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'hdd';
  if (FD_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'fd';
  return null;
}

function image(partial: Partial<StoredImage> & { sourceKey: string; name: string }): StoredImage {
  return {
    bytes: new ArrayBuffer(1024),
    savedAt: 1000,
    ...partial,
  };
}

describe('isLibraryDiskRecord', () => {
  it('ROM/ステート/非ディスクのレコードを除外する', () => {
    expect(isLibraryDiskRecord(image({ sourceKey: 'rom:font.rom', name: 'font.rom' }), classify)).toBe(false);
    expect(isLibraryDiskRecord(image({ sourceKey: 'state:x', name: 'state0.sav' }), classify)).toBe(false);
    expect(isLibraryDiskRecord(image({ sourceKey: 'file:a.txt:1', name: 'a.txt' }), classify)).toBe(false);
    expect(isLibraryDiskRecord(image({ sourceKey: 'file:a.d88:1', name: 'a.d88' }), classify)).toBe(true);
  });
});

describe('buildLibraryNodes', () => {
  it('グループ無しのレコードは単体ノードとして保存時刻の降順に並ぶ', () => {
    const nodes = buildLibraryNodes(
      [
        image({ sourceKey: 'k1', name: 'old.d88', savedAt: 100 }),
        image({ sourceKey: 'k2', name: 'new.thd', savedAt: 300 }),
        image({ sourceKey: 'k3', name: 'mid.xdf', savedAt: 200 }),
      ],
      classify,
    );
    expect(nodes.map((n) => (n.kind === 'item' ? n.entry.name : '?'))).toEqual([
      'new.thd',
      'mid.xdf',
      'old.d88',
    ]);
    expect(nodes.every((n) => n.kind === 'item')).toBe(true);
    const first = nodes[0];
    expect(first.kind === 'item' && first.entry.kind).toBe('hdd');
  });

  it('同一グループのレコードを1つのフォルダにまとめ、groupIndex順に並べる', () => {
    const nodes = buildLibraryNodes(
      [
        image({
          sourceKey: 'arc:g.zip:9/B.d88',
          name: 'B.d88',
          group: 'arc:g.zip:9',
          groupName: 'g.zip',
          groupIndex: 1,
          savedAt: 100,
        }),
        image({
          sourceKey: 'arc:g.zip:9/A.d88',
          name: 'A.d88',
          group: 'arc:g.zip:9',
          groupName: 'g.zip',
          groupIndex: 0,
          savedAt: 150,
        }),
        image({ sourceKey: 'solo', name: 'solo.d88', savedAt: 120 }),
      ],
      classify,
    );
    expect(nodes).toHaveLength(2);
    const [first, second] = nodes;
    // フォルダの並び順は中の最新保存時刻(150)なので単体(120)より前に来る。
    expect(first.kind).toBe('group');
    if (first.kind !== 'group') throw new Error('expected group');
    expect(first.group.id).toBe('arc:g.zip:9');
    expect(first.group.name).toBe('g.zip');
    expect(first.group.entries.map((e) => e.name)).toEqual(['A.d88', 'B.d88']);
    expect(second.kind).toBe('item');
  });

  it('displayName があれば表示名に使い、無ければ元のファイル名を使う', () => {
    const nodes = buildLibraryNodes(
      [
        image({ sourceKey: 'k1', name: 'GAME_A.d88', displayName: 'ゲームA 1枚目', savedAt: 200 }),
        image({ sourceKey: 'k2', name: 'GAME_B.d88', savedAt: 100 }),
      ],
      classify,
    );
    const names = nodes.map((n) => (n.kind === 'item' ? n.entry.displayName : '?'));
    expect(names).toEqual(['ゲームA 1枚目', 'GAME_B.d88']);
  });

  it('groupName が一部欠けていてもグループ名を復元する', () => {
    const nodes = buildLibraryNodes(
      [
        image({ sourceKey: 'a', name: 'A.d88', group: 'g', groupIndex: 0, savedAt: 100 }),
        image({ sourceKey: 'b', name: 'B.d88', group: 'g', groupName: 'game.lzh', groupIndex: 1, savedAt: 100 }),
      ],
      classify,
    );
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    if (node.kind !== 'group') throw new Error('expected group');
    expect(node.group.name).toBe('game.lzh');
  });

  it('ディスクイメージ以外のレコードは無視する', () => {
    const nodes = buildLibraryNodes(
      [image({ sourceKey: 'k1', name: 'readme.txt', savedAt: 100 })],
      classify,
    );
    expect(nodes).toEqual([]);
  });
});
