import * as zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildSpayd, computeSpaydCrc32, crc32, parseSpayd } from "../src/index.js";
import { codeOf } from "./helpers.js";

const zlibCrc = (s: string): string =>
  (zlib as unknown as { crc32(data: string | Uint8Array): number }).crc32(Buffer.from(s, "utf8")).toString(16).toUpperCase().padStart(8, "0");

describe("crc32", () => {
  it("matches the standard CRC-32 check value", () => {
    expect(crc32("123456789")).toBe("CBF43926");
    expect(crc32("")).toBe("00000000");
  });

  it("matches node:zlib crc32 on ASCII and UTF-8 input", () => {
    for (const s of ["SPD*1.0*ACC:CZ3301000000000002970297", "Příliš žluťoučký kůň", "€ 😀 *%+", "a".repeat(1000)]) {
      expect(crc32(s)).toBe(zlibCrc(s));
    }
  });
});

describe("SPAYD CRC32 attribute", () => {
  const base = {
    iban: "CZ3301000000000002970297",
    amount: 555.55,
    vs: "0987654321",
    message: "PRISPEVEK NA NADACI",
  };

  it("is computed over the header and the attributes sorted by key", () => {
    const s = buildSpayd({ ...base, crc32: true });
    // canonical string written out by hand: sorted keys AM, ACC, CC, MSG, X-VS
    const canonical = "SPD*1.0*ACC:CZ3301000000000002970297*AM:555.55*CC:CZK*MSG:PRISPEVEK NA NADACI*X-VS:0987654321";
    expect(s).toBe(
      `SPD*1.0*ACC:CZ3301000000000002970297*AM:555.55*CC:CZK*X-VS:0987654321*MSG:PRISPEVEK NA NADACI*CRC32:${zlibCrc(canonical)}`,
    );
    expect(s).toMatch(/\*CRC32:[0-9A-F]{8}$/);
  });

  it("is verified by the parser and survives a round trip", () => {
    const s = buildSpayd({ ...base, crc32: true });
    const p = parseSpayd(s);
    expect(p.crc32).toBe(true);
    expect(p.checksum).toBe(s.slice(-8));
    expect(buildSpayd(p)).toBe(s);
  });

  it("does not depend on the attribute order in the string", () => {
    const s = buildSpayd({ ...base, crc32: true });
    const crc = s.slice(-8);
    const reordered = `SPD*1.0*MSG:PRISPEVEK NA NADACI*X-VS:0987654321*CC:CZK*AM:555.55*ACC:CZ3301000000000002970297*CRC32:${crc}`;
    expect(parseSpayd(reordered).crc32).toBe(true);
    expect(computeSpaydCrc32(reordered)).toBe(crc);
  });

  it("covers percent-encoded values in their encoded form", () => {
    const s = buildSpayd({ ...base, message: "Platba za zboží", crc32: true });
    expect(s).toContain("MSG:Platba za zbo%C5%BE%C3%AD*");
    expect(parseSpayd(s).message).toBe("Platba za zboží");
  });

  it("detects tampering", () => {
    const s = buildSpayd({ ...base, crc32: true });
    expect(codeOf(() => parseSpayd(s.replace("555.55", "955.55")))).toBe("InvalidChecksum");
    expect(codeOf(() => parseSpayd(s.replace(/CRC32:.{8}$/, "CRC32:00000000")))).toBe("InvalidChecksum");
    expect(codeOf(() => parseSpayd(s.replace(/CRC32:(.{8})$/, (_m, c: string) => `CRC32:${c.toLowerCase()}`)))).toMatch(
      /InvalidField|InvalidChecksum/,
    );
  });

  it("also works for SCD strings", () => {
    const s = buildSpayd({ ...base, kind: "collection", crc32: true });
    expect(s.startsWith("SCD*1.0*")).toBe(true);
    expect(parseSpayd(s).crc32).toBe(true);
  });
});
