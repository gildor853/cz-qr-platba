// Examples copied verbatim from the ČBA standard "Formát pro sdílení platebních údajů v rámci
// tuzemského platebního styku v CZK prostřednictvím QR kódů", version 1.2 (June 2021),
// sections 5.2.1–5.2.4 and annex 2, and from https://qr-platba.cz/pro-vyvojare/specifikace-formatu/.
import { describe, expect, it } from "vitest";
import { buildSpayd, parseSpayd } from "../src/index.js";

const EX_521 =
  "SPD*1.0*ACC:CZ3301000000000002970297*AM:555.55*CC:CZK*RF:7004139146*X-VS:0987654321*X-SS:1234567890*X-KS:0558*DT:20210430*MSG:PRISPEVEK NA NADACI";
const EX_522 =
  "SPD*1.0*ACC:CZ3301000000000002970297*AM:555.55*CC:CZK*RF:7004139146*X-VS:0987654321*X-SS:1234567890*X-KS:0558*PT:IP*MSG:PRISPEVEK NA NADACI";
const EX_523 =
  "SPD*1.0*ACC:CZ3301000000000002970297*AM:555.55*CC:CZK*FRQ:1M*DT:20210430*DL:20230430*DH:0*MSG:PRAVIDELNY PRISPEVEK NA NADACI";
const EX_524 =
  "SCD*1.0*ACC:CZ3301000000000002970297*AM:555.55*CC:CZK*FRQ:1M*DT:20210430*DL:20260430*DH:0*MSG:PRAVIDELNY PRISPEVEK NA NADACI";
const EX_ANNEX2 =
  "SPD*1.0*ACC:CZ5855000000001265098001*AM:480.50*CC:CZK*RF:7004139146*X-SS:1234567890*DT:20120524*MSG:PLATBA ZA ZBOZI";
const EX_WEB = "SPD*1.0*ACC:CZ9106000000000000000123*AM:450.00*CC:CZK*MSG:PLATBA ZA ZBOZI*X-VS:1234567890";

describe("examples from the standard", () => {
  it("5.2.1 payment order", () => {
    expect(
      buildSpayd({
        iban: "CZ3301000000000002970297",
        amount: 555.55,
        reference: "7004139146",
        vs: "0987654321",
        ss: "1234567890",
        ks: "0558",
        dueDate: "2021-04-30",
        message: "PRISPEVEK NA NADACI",
      }),
    ).toBe(EX_521);
    expect(parseSpayd(EX_521)).toMatchObject({
      kind: "payment",
      version: "1.0",
      iban: "CZ3301000000000002970297",
      domesticAccount: { prefix: "", number: "2970297", bankCode: "0100", formatted: "2970297/0100" },
      amount: "555.55",
      currency: "CZK",
      reference: "7004139146",
      vs: "0987654321",
      ss: "1234567890",
      ks: "0558",
      dueDate: "2021-04-30",
      message: "PRISPEVEK NA NADACI",
      crc32: false,
    });
  });

  it("5.2.2 instant payment", () => {
    expect(
      buildSpayd({
        account: "2970297/0100",
        amount: "555.55",
        reference: 7004139146,
        vs: "0987654321",
        ss: 1234567890,
        ks: "0558",
        paymentType: "IP",
        message: "PRISPEVEK NA NADACI",
      }),
    ).toBe(EX_522);
    expect(parseSpayd(EX_522).paymentType).toBe("IP");
  });

  it("5.2.3 standing order", () => {
    expect(
      buildSpayd({
        iban: "CZ33 0100 0000 0000 0297 0297",
        amount: 555.55,
        frequency: "1M",
        dueDate: "20210430",
        lastDate: "2023-04-30",
        stopAfterDeath: false,
        message: "PRAVIDELNY PRISPEVEK NA NADACI",
      }),
    ).toBe(EX_523);
    expect(parseSpayd(EX_523)).toMatchObject({ frequency: "1M", lastDate: "2023-04-30", stopAfterDeath: false });
  });

  it("5.2.4 consent to collection (SCD)", () => {
    expect(
      buildSpayd({
        kind: "collection",
        iban: "CZ3301000000000002970297",
        amount: 555.55,
        frequency: "1M",
        dueDate: "2021-04-30",
        lastDate: "2026-04-30",
        stopAfterDeath: false,
        message: "PRAVIDELNY PRISPEVEK NA NADACI",
      }),
    ).toBe(EX_524);
    expect(parseSpayd(EX_524).kind).toBe("collection");
  });

  it("annex 2 example (115 characters)", () => {
    expect(EX_ANNEX2.length).toBe(115);
    expect(
      buildSpayd({
        account: "1265098001",
        bankCode: "5500",
        amount: 480.5,
        reference: "7004139146",
        ss: "1234567890",
        dueDate: "2012-05-24",
        message: "PLATBA ZA ZBOZI",
      }),
    ).toBe(EX_ANNEX2);
    expect(parseSpayd(EX_ANNEX2).domesticAccount?.formatted).toBe("1265098001/5500");
  });

  it.each([EX_521, EX_522, EX_523, EX_524, EX_ANNEX2])("round-trips %s", (s) => {
    expect(buildSpayd(parseSpayd(s))).toBe(s);
    expect(buildSpayd(parseSpayd(`${s}*`))).toBe(s);
  });

  it("web specification example (different attribute order) parses and rebuilds equivalently", () => {
    const p = parseSpayd(EX_WEB);
    expect(p).toMatchObject({ iban: "CZ9106000000000000000123", amount: "450.00", vs: "1234567890", message: "PLATBA ZA ZBOZI" });
    expect(p.domesticAccount?.formatted).toBe("123/0600");
    const rebuilt = buildSpayd(p);
    expect(rebuilt).toBe("SPD*1.0*ACC:CZ9106000000000000000123*AM:450.00*CC:CZK*X-VS:1234567890*MSG:PLATBA ZA ZBOZI");
    expect(parseSpayd(rebuilt)).toEqual({ ...p, attributes: parseSpayd(rebuilt).attributes });
  });
});
