// ローカルROM/素材ファイル登録API。
// デスクトップ版NP2kaiユーザーが手元に持つ BIOS.ROM 等を登録すると、
// IndexedDBにのみ保存され、次回以降の起動時にMEMFSへ自動注入される。

import type { DiskFile } from '../core/module.ts';
import * as db from '../storage/db.ts';

const ROM_KEY_PREFIX = 'rom:';

// コアが開くファイル名 (すべて小文字)。
const SUPPORTED_ROM_NAMES = new Set([
  'bios.rom',
  'itf.rom',
  'sound.rom',
  'font.rom',
  'bios9821.rom',
  '2608_bd.wav',
  '2608_sd.wav',
  '2608_top.wav',
  '2608_hh.wav',
  '2608_tom.wav',
  '2608_rim.wav',
]);

export interface RomEntry {
  name: string;
  size: number;
  savedAt: number;
}

/** 対応ファイル名かどうかを判定する（既知のファイル名一覧、または .rom 拡張子）。 */
export function isSupportedRomName(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_ROM_NAMES.has(lower) || lower.endsWith('.rom');
}

/** 複数ファイルを登録する。対応外のファイルは skipped に振り分ける。 */
export async function saveRomFiles(
  files: Array<{ name: string; bytes: Uint8Array }>,
): Promise<{ saved: string[]; skipped: string[] }> {
  const saved: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    if (!isSupportedRomName(lowerName)) {
      skipped.push(file.name);
      continue;
    }
    await db.put({
      sourceKey: `${ROM_KEY_PREFIX}${lowerName}`,
      name: lowerName,
      bytes: file.bytes.buffer.slice(
        file.bytes.byteOffset,
        file.bytes.byteOffset + file.bytes.byteLength,
      ) as ArrayBuffer,
      savedAt: Date.now(),
    });
    saved.push(lowerName);
  }
  return { saved, skipped };
}

/** 登録済みROM一覧を返す。 */
export async function listRoms(): Promise<RomEntry[]> {
  const stored = await db.getAllByPrefix(ROM_KEY_PREFIX);
  return stored
    .map((s) => ({ name: s.name, size: s.bytes.byteLength, savedAt: s.savedAt }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 登録済みROMを削除する。 */
export async function deleteRom(name: string): Promise<void> {
  await db.delete(`${ROM_KEY_PREFIX}${name.toLowerCase()}`);
}

/** 起動時にMEMFSへ注入するための全登録済みROMを読み出す。 */
export async function loadRomsForBoot(): Promise<DiskFile[]> {
  const stored = await db.getAllByPrefix(ROM_KEY_PREFIX);
  return stored.map((s) => ({ name: s.name, bytes: new Uint8Array(s.bytes) }));
}
