import { fail } from "./errors.js";
import { utf8Bytes } from "./crc32.js";

/** How characters outside printable ASCII are written into the SPAYD string. */
export type TextEncoding = "percent" | "utf8";

const hex = (b: number): string => `%${b.toString(16).toUpperCase().padStart(2, "0")}`;

/**
 * Encodes a free-text value for a SPAYD string.
 *
 * Always escaped: `*` (the separator, as `%2A`, required by the standard), `%` (the escape
 * character itself, `%25`) and `+` (`%2B`, because some readers decode `+` as a space, as the
 * reference implementation does), plus ASCII control characters.
 * With `encoding: "percent"` (default) every non-ASCII character is written as percent-encoded
 * UTF-8 bytes (e.g. `ž` → `%C5%BE`); with `"utf8"` it is left as is.
 */
export function encodeValue(value: string, encoding: TextEncoding = "percent"): string {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (ch === "*" || ch === "%" || ch === "+" || cp < 0x20 || cp === 0x7f) out += hex(cp);
    else if (cp > 0x7f && encoding === "percent") out += utf8Bytes(ch).map(hex).join("");
    else out += ch;
  }
  return out;
}

/**
 * Decodes a raw SPAYD value: `%XX` sequences are decoded as UTF-8; everything else, including
 * `+`, is taken literally.
 */
export function decodeValue(raw: string, field?: string): string {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
  } catch {
    return fail("InvalidField", "Value contains an invalid percent-encoded UTF-8 sequence.", field);
  }
}

/** Number of characters (Unicode code points) in a decoded value; used for the length limits. */
export function charLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** First `max` code points of `s`. */
export function truncateChars(s: string, max: number): string {
  let out = "";
  let n = 0;
  for (const ch of s) {
    if (n++ === max) break;
    out += ch;
  }
  return out;
}

/**
 * Upper-cases and strips diacritics (`"Žluťoučký kůň"` → `"ZLUTOUCKY KUN"`), so the value fits
 * the alphanumeric QR mode recommended by the standard. Characters that still fall outside
 * printable ASCII are kept and will be encoded.
 */
export function toAlphanumericText(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
