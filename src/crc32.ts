let TABLE: Uint32Array | undefined;

function table(): Uint32Array {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  return TABLE;
}

/** @internal UTF-8 encoding without relying on TextEncoder typings. */
export function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

/**
 * CRC-32 (IEEE 802.3 / ISO-HDLC polynomial, as in zlib, PNG and `java.util.zip.CRC32`) of the
 * UTF-8 bytes of `s`, as 8 upper-case hexadecimal digits. `crc32("123456789") === "CBF43926"`.
 */
export function crc32(s: string): string {
  const t = table();
  let c = 0xffffffff;
  for (const b of utf8Bytes(s)) c = t[(c ^ b) & 0xff]! ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, "0");
}
