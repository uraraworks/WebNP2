#!/usr/bin/env bash
# NP2kai/build のビルド成果物を public/core/ へ取り込むスクリプト。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NP2KAI_BUILD_DIR="${NP2KAI_BUILD_DIR:-/Users/haruurara/MyProject/_emulator/PC98/NP2kai/build}"
NP2KAI_ROOT_DIR="${NP2KAI_ROOT_DIR:-/Users/haruurara/MyProject/_emulator/PC98/NP2kai}"
DEST_DIR="${REPO_ROOT}/public/core"

mkdir -p "${DEST_DIR}"

echo "==> emnp21kai_sdl2.js"
cp "${NP2KAI_BUILD_DIR}/emnp21kai_sdl2.js" "${DEST_DIR}/emnp21kai_sdl2.js"

echo "==> emnp21kai_sdl2.wasm"
cp "${NP2KAI_BUILD_DIR}/emnp21kai_sdl2.wasm" "${DEST_DIR}/emnp21kai_sdl2.wasm"

echo "==> font.bmp"
cp "${NP2KAI_BUILD_DIR}/font.bmp" "${DEST_DIR}/font.bmp"

echo "==> LICENSE.NP2kai"
cp "${NP2KAI_ROOT_DIR}/LICENSE" "${DEST_DIR}/LICENSE.NP2kai"

echo "done. public/core/ contents:"
ls -la "${DEST_DIR}"
