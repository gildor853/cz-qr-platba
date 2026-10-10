import { describe, expect, it } from "vitest";
import { isValidSpayd, parseSpayd, tryParseSpayd } from "../src/index.js";
import { codeOf } from "./helpers.js";

const ACC = "ACC:CZ6508000000192000145399";

describe("parseSpayd", () => {
  it("parses a minimal string and reports the account", () => {
    const p = parseSpayd(`SPD*1.0*${ACC}`);
    expect(p).toMatchObject({ kind: "payment", iban: "CZ6508000000192000145399", currency: null, crc32: false });
    expect(p.domesticAccount?.formatted).toBe("19-2000145399/0800");
    expect(p.attributes).toEqual([["ACC", "CZ6508000000192000145399", "CZ6508000000192000145399"]]);
    expect(Object.isFrozen(p)).toBe(true);
  });

  it("parses IBAN+BIC and values containing ':'", () => {
    const p = parseSpayd(`SPD*1.0*${ACC}+GIBACZPX*X-URL:HTTP://EXAMPLE.COM:8080/X*MSG:CAS 10:30`);
    expect(p.bic).toBe("GIBACZPX");
    expect(p.url).toBe("HTTP://EXAMPLE.COM:8080/X");
    expect(p.message).toBe("CAS 10:30");
  });

  it("decodes percent-encoding but keeps '+' literal", () => {
    const p = parseSpayd(`SPD*1.0*${ACC}*MSG:A+B %2A %25 %C5%BE`);
    expect(p.message).toBe("A+B * % ž");
  });

  it("treats empty values as absent", () => {
    const p = parseSpayd(`SPD*1.0*${ACC}*DH:*MSG:`);
    expect(p.stopAfterDeath).toBeUndefined();
    expect(p.message).toBeUndefined();
  });

  it("collects unknown X- attributes", () => {
    expect(parseSpayd(`SPD*1.0*${ACC}*X-FOO:BAR`).extensions).toEqual({ "X-FOO": "BAR" });
  });

  it("rejects non-SPAYD input", () => {
    expect(codeOf(() => parseSpayd("hello"))).toBe("InvalidFormat");
    expect(codeOf(() => parseSpayd(""))).toBe("InvalidFormat");
    expect(codeOf(() => parseSpayd(`SPD*${ACC}`))).toBe("InvalidFormat");
    expect(codeOf(() => parseSpayd(`SPD*2.0*${ACC}`))).toBe("InvalidFormat");
    expect(codeOf(() => parseSpayd(`spd*1.0*${ACC}`))).toBe("InvalidFormat");
    expect(codeOf(() => parseSpayd(`SPD*1.0*${ACC}**MSG:A`))).toBe("InvalidFormat");
    expect(codeOf(() => parseSpayd(`SPD*1.0*${ACC}*msg:A`))).toBe("InvalidFormat");
    expect(codeOf(() => parseSpayd(`SPD*1.0*${ACC}*MSGA`))).toBe("InvalidFormat");
    expect(codeOf(() => parseSpayd(42 as unknown as string))).toBe("InvalidFormat");
  });

  it("rejects unknown, duplicate and missing keys", () => {
    expect(codeOf(() => parseSpayd(`SPD*1.0*${ACC}*FOO:1`))).toBe("UnknownKey");
    expect(codeOf(() => parseSpayd(`SPD*1.0*${ACC}*MSG:A*MSG:B`))).toBe("DuplicateKey");
    expect(codeOf(() => parseSpayd("SPD*1.0*AM:100.00"))).toBe("MissingField");
  });

  it("validates accounts", () => {
    expect(codeOf(() => parseSpayd("SPD*1.0*ACC:CZ6508000000192000145398"))).toBe("InvalidAccount");
    expect(codeOf(() => parseSpayd("SPD*1.0*ACC:cz6508000000192000145399"))).toBe("InvalidAccount");
    expect(codeOf(() => parseSpayd(`SPD*1.0*${ACC}+XX`))).toBe("InvalidAccount");
    expect(codeOf(() => parseSpayd(`SPD*1.0*${ACC}*ALT-ACC:CZ00123`))).toBe("InvalidAccount");
  });

  it("validates field formats", () => {
    const bad = (attr: string): string => codeOf(() => parseSpayd(`SPD*1.0*${ACC}*${attr}`));
    expect(bad("AM:1,50")).toBe("InvalidField");
    expect(bad("AM:1.505")).toBe("InvalidField");
    expect(bad("CC:czk")).toBe("InvalidField");
    expect(bad("X-VS:12A")).toBe("InvalidField");
    expect(bad("RF:-1")).toBe("InvalidField");
    expect(bad("DT:2021-04-30")).toBe("FieldTooLong");
    expect(bad("DT:2021043A")).toBe("InvalidField");
    expect(bad("DT:20210431")).toBe("InvalidField");
    expect(bad("FRQ:2W")).toBe("InvalidField");
    expect(bad("DH:2")).toBe("InvalidField");
    expect(bad("NT:S")).toBe("InvalidField");
    expect(bad("X-PER:31")).toBe("InvalidField");
    expect(bad("CRC32:XYZ")).toBe("InvalidField");
    expect(bad("MSG: A")).toBe("InvalidField");
    expect(bad("MSG:%C5")).toBe("InvalidField");
  });

  it("enforces length limits, or truncates from the left on request", () => {
    const long = `SPD*1.0*${ACC}*MSG:${"x".repeat(70)}`;
    expect(codeOf(() => parseSpayd(long))).toBe("FieldTooLong");
    expect(parseSpayd(long, { truncate: true }).message).toBe("x".repeat(60));
    expect(codeOf(() => parseSpayd(`SPD*1.0*${ACC}*X-VS:12345678901`))).toBe("FieldTooLong");
    expect(parseSpayd(`SPD*1.0*${ACC}*X-VS:12345678901`, { truncate: true }).vs).toBe("1234567890");
  });

  it("tryParseSpayd / isValidSpayd", () => {
    const r = tryParseSpayd(`SPD*1.0*${ACC}*AM:abc`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("InvalidField");
      expect(r.error.field).toBe("AM");
    }
    expect(isValidSpayd(`SPD*1.0*${ACC}*`)).toBe(true);
    expect(isValidSpayd("SPD*1.0*")).toBe(false);
  });
});
