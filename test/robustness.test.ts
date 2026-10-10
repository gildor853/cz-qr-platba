import { describe, expect, it } from "vitest";
import { buildSpayd, parseSpayd, tryBuildSpayd, type SpaydInput } from "../src/index.js";
import { codeOf } from "./helpers.js";

const IBAN = "CZ6508000000192000145399";
const nasty = <T>(v: unknown): T => v as T;

describe("buildSpayd: untrusted (non-TypeScript) input never throws a raw TypeError", () => {
  const cases: Array<[string, unknown, string]> = [
    ["null input", null, "InvalidField"],
    ["iban as number", { iban: 42 }, "InvalidAccount"],
    ["account as null", { account: null }, "InvalidAccount"],
    ["bankCode as number", { account: "19-2000145399", bankCode: 800 }, "InvalidAccount"],
    ["bic as number", { iban: IBAN, bic: 1 }, "InvalidAccount"],
    ["alternate account null", { iban: IBAN, alternateAccounts: [null] }, "InvalidAccount"],
    ["alternate account number", { iban: IBAN, alternateAccounts: [5] }, "InvalidAccount"],
    ["alternateAccounts as string", { iban: IBAN, alternateAccounts: "CZ69..." }, "InvalidField"],
    ["alternate iban object with number", { iban: IBAN, alternateAccounts: [{ iban: 1 }] }, "InvalidAccount"],
    ["amount as boolean", { iban: IBAN, amount: true }, "InvalidField"],
    ["vs as null", { iban: IBAN, vs: null }, "InvalidField"],
    ["ks as object", { iban: IBAN, ks: {} }, "InvalidField"],
    ["paymentType as number", { iban: IBAN, paymentType: 1 }, "InvalidField"],
    ["message as number", { iban: IBAN, message: 1 }, "InvalidField"],
    ["extension value as number", { iban: IBAN, extensions: { "X-FOO": 1 } }, "InvalidField"],
  ];
  it.each(cases)("%s", (_name, input, code) => {
    expect(codeOf(() => buildSpayd(nasty<SpaydInput>(input)))).toBe(code);
    expect(tryBuildSpayd(nasty<SpaydInput>(input)).ok).toBe(false);
  });
});

describe("ASCII-only normalisation", () => {
  // "ſ" (long s) upper-cases to "S" and "ﬀ" to "FF" with String#toUpperCase.
  it("rejects IBAN/BIC with non-ASCII letters in the builder", () => {
    expect(buildSpayd({ iban: "GB82 WEST 1234 5698 7654 32", currency: "GBP" })).toContain("ACC:GB82WEST12345698765432*");
    expect(codeOf(() => buildSpayd({ iban: "GB82 WEſT 1234 5698 7654 32" }))).toBe("InvalidAccount");
    expect(codeOf(() => buildSpayd({ iban: IBAN, bic: "ﬀbaczpx" }))).toBe("InvalidAccount");
  });

  it("rejects them in the parser", () => {
    expect(codeOf(() => parseSpayd("SPD*1.0*ACC:GB82WEſT12345698765432"))).toBe("InvalidAccount");
  });
});

describe("buildSpayd: remaining branches", () => {
  it("rejects a string account with more than one '+'", () => {
    expect(codeOf(() => buildSpayd({ iban: `${IBAN}+GIBACZPX+X` }))).toBe("InvalidAccount");
    expect(codeOf(() => buildSpayd({ alternateAccounts: [`${IBAN}+GIBACZPX+X`], iban: IBAN }))).toBe("InvalidAccount");
  });

  it("validates domestic account parts", () => {
    for (const account of ["1234567-2000145399/0800", "1/0800", "19-2000145399/080", "19-0000000001/0800", "19-2000145398/0800", "18-2000145399/0800"]) {
      expect(codeOf(() => buildSpayd({ account }))).toBe("InvalidAccount");
    }
    expect(codeOf(() => buildSpayd({ account: "19-2000145399/0800", bankCode: "0100" }))).toBe("InvalidAccount");
    expect(codeOf(() => buildSpayd({ account: "19-2000145399" }))).toBe("InvalidAccount");
    expect(buildSpayd({ account: "19-2000145399/0800", bankCode: "0800" })).toContain(`ACC:${IBAN}`);
  });

  it("writes NT:P for phone notifications", () => {
    expect(buildSpayd({ iban: IBAN, notificationType: "phone", notificationAddress: "+420123456789" })).toContain(
      "NT:P*NTA:%2B420123456789",
    );
  });
});

describe("parseSpayd: remaining fields", () => {
  it("reads NT, NTA, X-PER, X-ID, X-URL and X-SELF", () => {
    const p = parseSpayd(`SPD*1.0*ACC:${IBAN}*NT:P*NTA:%2B420123456789*X-PER:0*X-ID:ABC*X-URL:HTTP://EXAMPLE.COM*X-SELF:pozn`);
    expect(p).toMatchObject({
      notificationType: "phone",
      notificationAddress: "+420123456789",
      retryDays: 0,
      paymentId: "ABC",
      url: "HTTP://EXAMPLE.COM",
      selfMessage: "pozn",
    });
    expect(parseSpayd(`SPD*1.0*ACC:${IBAN}*NT:E`).notificationType).toBe("email");
    expect(codeOf(() => parseSpayd(`SPD*1.0*ACC:${IBAN}*NT:X`))).toBe("InvalidField");
    expect(codeOf(() => parseSpayd(`SPD*1.0*ACC:${IBAN}*X-PER:3a`))).toBe("InvalidField");
  });
});
