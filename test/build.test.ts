import { describe, expect, it } from "vitest";
import { buildSpayd, parseSpayd, SPAYD_FIELD_LIMITS, tryBuildSpayd } from "../src/index.js";
import { codeOf } from "./helpers.js";

const IBAN = "CZ6508000000192000145399";

describe("buildSpayd: accounts", () => {
  it("accepts IBAN (any spacing/case), IBAN+BIC, or a domestic account", () => {
    expect(buildSpayd({ iban: "cz65 0800 0000 1920 0014 5399" })).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK`);
    expect(buildSpayd({ iban: IBAN, bic: "gibaczpx" })).toBe(`SPD*1.0*ACC:${IBAN}+GIBACZPX*CC:CZK`);
    expect(buildSpayd({ account: "19-2000145399/0800" })).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK`);
    expect(buildSpayd({ account: "19-2000145399", bankCode: "0800" })).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK`);
    expect(buildSpayd({ account: "178124-4159/0710" })).toContain("ACC:CZ6907101781240000004159*");
  });

  it("accepts foreign IBANs (MOD 97 only)", () => {
    expect(buildSpayd({ iban: "DE89 3704 0044 0532 0130 00", currency: "EUR" })).toBe("SPD*1.0*ACC:DE89370400440532013000*CC:EUR");
  });

  it("writes alternate accounts", () => {
    const s = buildSpayd({
      iban: IBAN,
      alternateAccounts: ["CZ6907101781240000004159", { account: "123457/0710", bic: "CNBACZPP" }],
    });
    expect(s).toBe(`SPD*1.0*ACC:${IBAN}*ALT-ACC:CZ6907101781240000004159,CZ4907100000000000123457+CNBACZPP*CC:CZK`);
    expect(parseSpayd(s).alternateAccounts).toEqual([
      { iban: "CZ6907101781240000004159" },
      { iban: "CZ4907100000000000123457", bic: "CNBACZPP" },
    ]);
  });

  it("rejects invalid or missing accounts", () => {
    expect(codeOf(() => buildSpayd({}))).toBe("MissingField");
    expect(codeOf(() => buildSpayd({ iban: IBAN, account: "123457/0710" }))).toBe("InvalidField");
    expect(codeOf(() => buildSpayd({ iban: "CZ6508000000192000145398" }))).toBe("InvalidAccount");
    expect(codeOf(() => buildSpayd({ account: "19-2000145398/0800" }))).toBe("InvalidAccount");
    expect(codeOf(() => buildSpayd({ account: "2000145399" }))).toBe("InvalidAccount");
    expect(codeOf(() => buildSpayd({ account: "19-2000145399/0800", bankCode: "0100" }))).toBe("InvalidAccount");
    expect(codeOf(() => buildSpayd({ iban: IBAN, bic: "GIBA" }))).toBe("InvalidAccount");
    // three alternates exceed ALT-ACC's 93 characters
    expect(codeOf(() => buildSpayd({ iban: IBAN, alternateAccounts: [IBAN, IBAN, IBAN, IBAN] }))).toBe("FieldTooLong");
  });
});

describe("buildSpayd: amount", () => {
  const am = (amount: number | string): string => buildSpayd({ iban: IBAN, amount, currency: null });

  it("always writes two decimals with a dot", () => {
    expect(am(450)).toBe(`SPD*1.0*ACC:${IBAN}*AM:450.00`);
    expect(am(480.5)).toContain("AM:480.50");
    expect(am("0.1")).toContain("AM:0.10");
    expect(am("007.5")).toContain("AM:7.50");
    expect(am(9999999.99)).toContain("AM:9999999.99");
  });

  it("rejects more than 2 decimals, floats with noise, negatives, zero and overflow", () => {
    expect(codeOf(() => am(1.234))).toBe("InvalidField");
    expect(codeOf(() => am(0.1 + 0.2))).toBe("InvalidField");
    expect(codeOf(() => am("1,50"))).toBe("InvalidField");
    expect(codeOf(() => am(-1))).toBe("InvalidField");
    expect(codeOf(() => am(0))).toBe("InvalidField");
    expect(codeOf(() => am(Number.NaN))).toBe("InvalidField");
    expect(codeOf(() => am(1e21))).toBe("InvalidField");
    expect(codeOf(() => am(10000000))).toBe("FieldTooLong");
  });
});

describe("buildSpayd: symbols, dates and coded fields", () => {
  it("keeps leading zeros of symbols given as strings", () => {
    expect(buildSpayd({ iban: IBAN, vs: "0012", ss: 5, ks: "0308" })).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK*X-VS:0012*X-SS:5*X-KS:0308`);
  });

  it("validates symbols and the reference", () => {
    expect(codeOf(() => buildSpayd({ iban: IBAN, vs: "12345678901" }))).toBe("FieldTooLong");
    expect(codeOf(() => buildSpayd({ iban: IBAN, vs: "12A" }))).toBe("InvalidField");
    expect(codeOf(() => buildSpayd({ iban: IBAN, ks: -1 }))).toBe("InvalidField");
    expect(codeOf(() => buildSpayd({ iban: IBAN, reference: "12345678901234567" }))).toBe("FieldTooLong");
    expect(buildSpayd({ iban: IBAN, reference: "1234567890123456" })).toContain("RF:1234567890123456");
  });

  it("validates dates", () => {
    expect(buildSpayd({ iban: IBAN, dueDate: "2024-02-29" })).toContain("DT:20240229");
    expect(codeOf(() => buildSpayd({ iban: IBAN, dueDate: "2023-02-29" }))).toBe("InvalidField");
    expect(codeOf(() => buildSpayd({ iban: IBAN, dueDate: "30.4.2021" }))).toBe("InvalidField");
    expect(codeOf(() => buildSpayd({ iban: IBAN, lastDate: "2021-13-01" }))).toBe("InvalidField");
  });

  it("writes and validates FRQ, DH, NT/NTA, X-PER, PT", () => {
    const s = buildSpayd({
      iban: IBAN,
      frequency: "3M",
      stopAfterDeath: true,
      notificationType: "email",
      notificationAddress: "jan.novak@example.com",
      retryDays: 7,
      paymentType: "ip",
    });
    expect(s).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK*FRQ:3M*DH:1*PT:IP*NT:E*NTA:jan.novak@example.com*X-PER:7`);
    expect(codeOf(() => buildSpayd({ iban: IBAN, frequency: "2W" as "1M" }))).toBe("InvalidField");
    expect(codeOf(() => buildSpayd({ iban: IBAN, retryDays: 31 }))).toBe("InvalidField");
    expect(codeOf(() => buildSpayd({ iban: IBAN, notificationType: "sms" as "phone" }))).toBe("InvalidField");
    expect(codeOf(() => buildSpayd({ iban: IBAN, paymentType: "ABCD" }))).toBe("FieldTooLong");
    expect(codeOf(() => buildSpayd({ iban: IBAN, currency: "Kč" }))).toBe("InvalidField");
  });

  it("writes X-ID, X-URL, X-SELF and custom extensions", () => {
    const s = buildSpayd({
      iban: IBAN,
      paymentId: "ORDER-42",
      url: "HTTP://WWW.SOMEURL.COM/",
      selfMessage: "PLATBA ZA TELCO SLUZBY",
      extensions: { "X-FOO": "BAR" },
    });
    expect(s).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK*X-ID:ORDER-42*X-URL:HTTP://WWW.SOMEURL.COM/*X-SELF:PLATBA ZA TELCO SLUZBY*X-FOO:BAR`);
    expect(parseSpayd(s).extensions).toEqual({ "X-FOO": "BAR" });
    expect(codeOf(() => buildSpayd({ iban: IBAN, extensions: { "X-VS": "1" } }))).toBe("DuplicateKey");
    expect(codeOf(() => buildSpayd({ iban: IBAN, extensions: { FOO: "1" } }))).toBe("InvalidField");
  });

  it("supports kind and returns typed errors from tryBuildSpayd", () => {
    expect(codeOf(() => buildSpayd({ iban: IBAN, kind: "refund" as "payment" }))).toBe("InvalidField");
    const r = tryBuildSpayd({ iban: IBAN, amount: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("AM");
  });
});

describe("buildSpayd: text, escaping and limits", () => {
  it("escapes '*', '%' and '+' and percent-encodes non-ASCII by default", () => {
    const s = buildSpayd({ iban: IBAN, message: "SLEVA 10% * 2 + DPH", recipientName: "Petr Dvořák" });
    expect(s).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK*RN:Petr Dvo%C5%99%C3%A1k*MSG:SLEVA 10%25 %2A 2 %2B DPH`);
    const p = parseSpayd(s);
    expect(p.message).toBe("SLEVA 10% * 2 + DPH");
    expect(p.recipientName).toBe("Petr Dvořák");
  });

  it("can write UTF-8 directly", () => {
    const s = buildSpayd({ iban: IBAN, message: "Zboží *1" }, { encoding: "utf8" });
    expect(s).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK*MSG:Zboží %2A1`);
    expect(parseSpayd(s).message).toBe("Zboží *1");
  });

  it("can transliterate free text for the alphanumeric QR mode", () => {
    const s = buildSpayd({ iban: IBAN, message: "Příliš žluťoučký kůň", recipientName: "Jiří" }, { alphanumeric: true });
    expect(s).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK*RN:JIRI*MSG:PRILIS ZLUTOUCKY KUN`);
  });

  it("trims values and omits empty ones", () => {
    expect(buildSpayd({ iban: IBAN, message: "  AHOJ  ", recipientName: "   " })).toBe(`SPD*1.0*ACC:${IBAN}*CC:CZK*MSG:AHOJ`);
  });

  it("checks length limits on the unescaped text", () => {
    expect(SPAYD_FIELD_LIMITS.MSG).toBe(60);
    expect(buildSpayd({ iban: IBAN, message: "ž".repeat(60) })).toContain("MSG:%C5%BE");
    expect(codeOf(() => buildSpayd({ iban: IBAN, message: "x".repeat(61) }))).toBe("FieldTooLong");
    expect(codeOf(() => buildSpayd({ iban: IBAN, recipientName: "x".repeat(36) }))).toBe("FieldTooLong");
    expect(codeOf(() => buildSpayd({ iban: IBAN, selfMessage: "x".repeat(61) }))).toBe("FieldTooLong");
    expect(codeOf(() => buildSpayd({ iban: IBAN, paymentId: "x".repeat(21) }))).toBe("FieldTooLong");
    expect(codeOf(() => buildSpayd({ iban: IBAN, url: "x".repeat(141) }))).toBe("FieldTooLong");
  });

  it("escapes control characters", () => {
    expect(buildSpayd({ iban: IBAN, message: "A\nB" })).toContain("MSG:A%0AB");
  });
});

describe("round trip of arbitrary text", () => {
  it("parse(build(x)) returns the same text for random strings in both encodings", () => {
    const alphabet = ["A", "z", " ", "*", "%", "+", ":", ",", "/", "ř", "Ž", "€", "😀", "%2A", "&", "?", "="];
    let seed = 12345;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let i = 0; i < 300; i++) {
      let msg = "";
      const len = 1 + rnd(40);
      for (let j = 0; j < len; j++) msg += alphabet[rnd(alphabet.length)];
      msg = msg.trim();
      if (msg === "") continue;
      for (const encoding of ["percent", "utf8"] as const) {
        const s = buildSpayd({ iban: IBAN, message: msg, crc32: true }, { encoding });
        expect(parseSpayd(s).message).toBe(msg);
      }
    }
  });
});
