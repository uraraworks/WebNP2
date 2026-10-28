/** ビューがバッファ全体を覆う場合はコピーせずに返す。 */
export function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  return new Uint8Array(bytes).buffer;
}
