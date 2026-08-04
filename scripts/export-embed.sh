#!/usr/bin/env bash
# 埋め込みライブラリと実行に必要なコア一式を PC98Dev/ide へ同期する。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PC98DEV_ROOT="${PC98DEV_ROOT:-/Users/haruurara/MyProject/_emulator/PC98/PC98Dev}"
EMBED_DEST_DIR="${EMBED_DEST_DIR:-${PC98DEV_ROOT}/ide/vendor/webnp2}"
CORE_DEST_DIR="${CORE_DEST_DIR:-${PC98DEV_ROOT}/ide/core}"
FREEDOS_DEST_DIR="${FREEDOS_DEST_DIR:-${PC98DEV_ROOT}/ide/freedos}"

if [[ ! -d "${PC98DEV_ROOT}" ]]; then
  echo "PC98Dev root not found: ${PC98DEV_ROOT}" >&2
  exit 1
fi

echo "==> build packages/embed"
npm --prefix "${REPO_ROOT}/packages/embed" run build

mkdir -p "${EMBED_DEST_DIR}" "${CORE_DEST_DIR}" "${FREEDOS_DEST_DIR}"

echo "==> webnp2-embed.js / style.css / d.ts"
cp "${REPO_ROOT}/packages/embed/dist/webnp2-embed.js" "${EMBED_DEST_DIR}/webnp2-embed.js"
cp "${REPO_ROOT}/packages/embed/dist/style.css" "${EMBED_DEST_DIR}/style.css"
rm -rf "${EMBED_DEST_DIR}/types"
cp -R "${REPO_ROOT}/packages/embed/dist/types" "${EMBED_DEST_DIR}/types"
cp "${REPO_ROOT}/packages/embed/LICENSE.WebNP2" "${EMBED_DEST_DIR}/LICENSE.WebNP2"

echo "==> emnp21kai_sdl2.js / emnp21kai_sdl2.wasm / font.bmp / LICENSE.NP2kai"
cp "${REPO_ROOT}/public/core/emnp21kai_sdl2.js" "${CORE_DEST_DIR}/emnp21kai_sdl2.js"
cp "${REPO_ROOT}/public/core/emnp21kai_sdl2.wasm" "${CORE_DEST_DIR}/emnp21kai_sdl2.wasm"
cp "${REPO_ROOT}/public/core/font.bmp" "${CORE_DEST_DIR}/font.bmp"
cp "${REPO_ROOT}/public/core/LICENSE.NP2kai" "${CORE_DEST_DIR}/LICENSE.NP2kai"

# 最小IDEの起動実証に使うFreeDOS(98)も、GPL表記と一緒に同期する。
echo "==> FreeDOS(98) boot image / license notice"
cp "${REPO_ROOT}/public/freedos/fd98_2hd.xdf" "${FREEDOS_DEST_DIR}/fd98_2hd.xdf"
cp "${REPO_ROOT}/public/freedos/README.txt" "${FREEDOS_DEST_DIR}/README.txt"

echo "done. embed contents:"
ls -la "${EMBED_DEST_DIR}"
echo "done. core contents:"
ls -la "${CORE_DEST_DIR}"
echo "done. FreeDOS contents:"
ls -la "${FREEDOS_DEST_DIR}"
