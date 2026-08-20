import { describe, expect, it } from 'vitest';
import { buildLibraryNodes, classifyLibUrlResult, isLibraryDiskRecord } from '../src/api/library.ts';
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
  it('グループ無しのレコードは単体ノードとして名前順に並ぶ(保存時刻は無視する)', () => {
    const nodes = buildLibraryNodes(
      [
        image({ sourceKey: 'k1', name: 'old.d88', savedAt: 300 }),
        image({ sourceKey: 'k2', name: 'new.thd', savedAt: 100 }),
        image({ sourceKey: 'k3', name: 'mid.xdf', savedAt: 200 }),
      ],
      classify,
    );
    expect(nodes.map((n) => (n.kind === 'item' ? n.entry.name : '?'))).toEqual([
      'mid.xdf',
      'new.thd',
      'old.d88',
    ]);
    expect(nodes.every((n) => n.kind === 'item')).toBe(true);
  });

  it('同一グループのレコードを1つのフォルダにまとめ、displayName の名前順に並べる(groupIndexは無視する)', () => {
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
    // トップレベルはフォルダを先・単体を後にする(savedAtは無視)。
    expect(first.kind).toBe('group');
    if (first.kind !== 'group') throw new Error('expected group');
    expect(first.group.id).toBe('arc:g.zip:9');
    expect(first.group.name).toBe('g.zip');
    expect(first.group.entries.map((e) => e.name)).toEqual(['A.d88', 'B.d88']);
    expect(second.kind).toBe('item');
  });

  it('displayName があれば表示名に使い、無ければ元のファイル名を使う(名前順に並ぶ)', () => {
    const nodes = buildLibraryNodes(
      [
        image({ sourceKey: 'k1', name: 'GAME_A.d88', displayName: 'ゲームA 1枚目', savedAt: 200 }),
        image({ sourceKey: 'k2', name: 'GAME_B.d88', savedAt: 100 }),
      ],
      classify,
    );
    const names = nodes.map((n) => (n.kind === 'item' ? n.entry.displayName : '?'));
    expect(names).toEqual(['GAME_B.d88', 'ゲームA 1枚目']);
  });

  it('DISK1/DISK2/DISK10 を逆順・シャッフルで与えても numeric 照合で1→2→10の順に並ぶ', () => {
    const nodes = buildLibraryNodes(
      [
        image({
          sourceKey: 'arc:pack.zip:1/DISK10.d88',
          name: 'DISK10.d88',
          group: 'arc:pack.zip:1',
          groupName: 'pack.zip',
          groupIndex: 0,
          savedAt: 100,
        }),
        image({
          sourceKey: 'arc:pack.zip:1/DISK1.d88',
          name: 'DISK1.d88',
          group: 'arc:pack.zip:1',
          groupName: 'pack.zip',
          groupIndex: 2,
          savedAt: 100,
        }),
        image({
          sourceKey: 'arc:pack.zip:1/DISK2.d88',
          name: 'DISK2.d88',
          group: 'arc:pack.zip:1',
          groupName: 'pack.zip',
          groupIndex: 1,
          savedAt: 100,
        }),
      ],
      classify,
    );
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    if (node.kind !== 'group') throw new Error('expected group');
    expect(node.group.entries.map((e) => e.name)).toEqual(['DISK1.d88', 'DISK2.d88', 'DISK10.d88']);
  });

  it('groupIndex が名前順と矛盾していても名前順を優先する', () => {
    const nodes = buildLibraryNodes(
      [
        image({
          sourceKey: 'arc:pack.zip:1/DISK1.d88',
          name: 'DISK1.d88',
          group: 'arc:pack.zip:1',
          groupName: 'pack.zip',
          groupIndex: 2,
          savedAt: 100,
        }),
        image({
          sourceKey: 'arc:pack.zip:1/DISK2.d88',
          name: 'DISK2.d88',
          group: 'arc:pack.zip:1',
          groupName: 'pack.zip',
          groupIndex: 0,
          savedAt: 100,
        }),
      ],
      classify,
    );
    const node = nodes[0];
    if (node.kind !== 'group') throw new Error('expected group');
    expect(node.group.entries.map((e) => e.name)).toEqual(['DISK1.d88', 'DISK2.d88']);
  });

  it('トップレベルはフォルダが先・単体が後になり、それぞれ名前順に並ぶ', () => {
    const nodes = buildLibraryNodes(
      [
        image({ sourceKey: 'item:z', name: 'zeta.d88', savedAt: 100 }),
        image({ sourceKey: 'item:a', name: 'alpha.d88', savedAt: 900 }),
        image({
          sourceKey: 'arc:z.zip:1/A.d88',
          name: 'A.d88',
          group: 'arc:z.zip:1',
          groupName: 'zzz-group',
          groupIndex: 0,
          savedAt: 1,
        }),
        image({
          sourceKey: 'arc:a.zip:1/A.d88',
          name: 'A.d88',
          group: 'arc:a.zip:1',
          groupName: 'aaa-group',
          groupIndex: 0,
          savedAt: 1,
        }),
      ],
      classify,
    );
    const shape = nodes.map((n) =>
      n.kind === 'group' ? `group:${n.group.name}` : `item:${n.entry.displayName}`,
    );
    expect(shape).toEqual(['group:aaa-group', 'group:zzz-group', 'item:alpha.d88', 'item:zeta.d88']);
  });

  it('同名・同displayNameが複数件あっても順序が決定的(sourceKeyでタイブレーク)', () => {
    const stored = [
      image({ sourceKey: 'item:b', name: 'same.d88', savedAt: 100 }),
      image({ sourceKey: 'item:a', name: 'same.d88', savedAt: 200 }),
    ];
    const first = buildLibraryNodes(stored, classify).map((n) => (n.kind === 'item' ? n.entry.sourceKey : '?'));
    const second = buildLibraryNodes([...stored].reverse(), classify).map((n) =>
      n.kind === 'item' ? n.entry.sourceKey : '?',
    );
    expect(first).toEqual(['item:a', 'item:b']);
    expect(second).toEqual(first);
  });

  it('日本語の displayName が混ざっても例外なく並ぶ(件数が保たれる)', () => {
    const nodes = buildLibraryNodes(
      [
        image({ sourceKey: 'k1', name: 'a.d88', displayName: 'ゲーム あ', savedAt: 100 }),
        image({ sourceKey: 'k2', name: 'b.d88', displayName: 'ゲーム ん', savedAt: 100 }),
        image({ sourceKey: 'k3', name: 'c.d88', displayName: 'ABCゲーム', savedAt: 100 }),
      ],
      classify,
    );
    expect(nodes).toHaveLength(3);
    expect(nodes.every((n) => n.kind === 'item')).toBe(true);
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

describe('classifyLibUrlResult', () => {
  it('0件はemptyになる(圧縮ファイル内にディスクイメージが無かった場合)', () => {
    expect(classifyLibUrlResult([], 'arcurl:https://example.com/disks.zip')).toEqual({ kind: 'empty' });
  });

  it('1件はsingleになりsourceKeyを返す(自動起動はしないため名前/バイト列は持たない)', () => {
    expect(classifyLibUrlResult([{ sourceKey: 'arcurl:x/DISK_A.TFD' }], 'arcurl:x')).toEqual({
      kind: 'single',
      sourceKey: 'arcurl:x/DISK_A.TFD',
    });
  });

  it('2件以上はgroupになりgroupIdを返す(種別チェックはしないので混在も許容する)', () => {
    const outcome = classifyLibUrlResult(
      [{ sourceKey: 'arcurl:x/DISK_A.TFD' }, { sourceKey: 'arcurl:x/DISK_B.HDI' }],
      'arcurl:x',
    );
    expect(outcome).toEqual({ kind: 'group', groupId: 'arcurl:x' });
  });
});
