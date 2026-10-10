// Czech account number and IBAN helpers. This is a deliberately small copy of the logic in
// cz-validators (https://github.com/gildor853/cz-validators), kept here so that this package
// stays dependency-free. Sources: Vyhláška ČNB č. 169/2011 Sb. (§ 4–6 and annex), ISO 13616.
import { fail } from "./errors.js";

/**
 * Upper-cases ASCII letters only. `String#toUpperCase` would also map characters such as
 * "ſ" (long s) or "ﬀ" (ligature) to ASCII letters, letting non-ASCII input pass validation.
 */
function asciiUpper(s: string): string {
  return s.replace(/[a-z]+/g, (m) => m.toUpperCase());
}

function requireText(v: unknown, what: string, field: string): string {
  if (typeof v !== "string") fail("InvalidAccount", `${what} must be a string.`, field);
  return v;
}

const WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1] as const;

/** @internal Weighted mod-11 check of one account part (prefix or base number). */
export function isValidAccountPart(digits: string): boolean {
  if (typeof digits !== "string" || !/^\d{1,10}$/.test(digits)) return false;
  const padded = digits.padStart(10, "0");
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(padded[i]) * WEIGHTS[i]!;
  return sum % 11 === 0;
}

/** @internal ISO 7064 MOD 97-10 over an upper-case IBAN. */
export function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const v = code >= 48 && code <= 57 ? code - 48 : code - 55;
    rem = v >= 10 ? (rem * 100 + v) % 97 : (rem * 10 + v) % 97;
  }
  return rem;
}

/** A Czech domestic account number. */
export interface DomesticAccount {
  /** Prefix without leading zeros, `""` when none. */
  readonly prefix: string;
  /** Base number without leading zeros. */
  readonly number: string;
  /** Four-digit bank code. */
  readonly bankCode: string;
  /** Canonical form, e.g. `"19-2000145399/0800"`. */
  readonly formatted: string;
}

function checkDomestic(prefix: string, number: string, bankCode: string, field: string): DomesticAccount {
  if (!/^\d{0,6}$/.test(prefix)) fail("InvalidAccount", "Account prefix must have at most 6 digits.", field);
  if (!/^\d{2,10}$/.test(number)) fail("InvalidAccount", "Account number must have 2 to 10 digits.", field);
  if (!/^\d{4}$/.test(bankCode)) fail("InvalidAccount", "Bank code must have exactly 4 digits.", field);
  if (number.replace(/0/g, "").length < 2) fail("InvalidAccount", "Account number must contain at least two non-zero digits.", field);
  if (!isValidAccountPart(prefix === "" ? "0" : prefix)) fail("InvalidAccount", "Account prefix fails the mod-11 check.", field);
  if (!isValidAccountPart(number)) fail("InvalidAccount", "Account number fails the mod-11 check.", field);
  const p = prefix.replace(/^0+/, "");
  const n = number.replace(/^0+/, "");
  return Object.freeze({ prefix: p, number: n, bankCode, formatted: `${p === "" ? "" : `${p}-`}${n}/${bankCode}` });
}

/** @internal Parses `[prefix-]number/bankCode`, or `[prefix-]number` with a separate bank code. */
export function parseDomesticAccount(account: string, bankCode: string | undefined, field: string): DomesticAccount {
  const s = requireText(account, "Account", field).replace(/\s+/g, "");
  if (bankCode !== undefined) requireText(bankCode, "Bank code", field);
  const m = /^(?:(\d+)-)?(\d+)(?:\/(\d+))?$/.exec(s);
  if (!m) fail("InvalidAccount", "Account must look like [prefix-]number/bankCode.", field);
  const code = m[3] ?? bankCode?.replace(/\s+/g, "");
  if (m[3] !== undefined && bankCode !== undefined && m[3] !== bankCode.replace(/\s+/g, ""))
    fail("InvalidAccount", "Bank code given twice with different values.", field);
  if (code === undefined) fail("InvalidAccount", "Bank code is missing.", field);
  return checkDomestic(m[1] ?? "", m[2]!, code, field);
}

/** @internal Domestic account → CZ IBAN (electronic format). */
export function domesticToIban(acc: DomesticAccount): string {
  const bban = acc.bankCode + acc.prefix.padStart(6, "0") + acc.number.padStart(10, "0");
  const check = String(98 - ibanMod97(`CZ00${bban}`)).padStart(2, "0");
  return `CZ${check}${bban}`;
}

/**
 * @internal Validates an IBAN: generic shape (max 34) and MOD 97-10 for every country;
 * for CZ additionally length 24 and the domestic account checks. Returns it upper-cased
 * without spaces.
 */
export function normalizeIban(input: string, field: string): string {
  const s = asciiUpper(requireText(input, "IBAN", field).replace(/\s+/g, ""));
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) fail("InvalidAccount", "IBAN has an invalid format.", field);
  if (s.startsWith("CZ") && !/^CZ\d{22}$/.test(s)) fail("InvalidAccount", "A CZ IBAN has 24 characters, all digits after CZ.", field);
  if (ibanMod97(s) !== 1) fail("InvalidAccount", "IBAN check digits do not match.", field);
  if (s.startsWith("CZ")) checkDomestic(s.slice(8, 14), s.slice(14), s.slice(4, 8), field);
  return s;
}

/** @internal CZ IBAN → domestic account (assumes a normalized, valid CZ IBAN). */
export function ibanToDomestic(iban: string): DomesticAccount {
  return checkDomestic(iban.slice(8, 14), iban.slice(14), iban.slice(4, 8), "ACC");
}

/** @internal ISO 9362 BIC: 4 letters (institution), 2 letters (country), 2 alphanumerics, optional 3 alphanumerics. */
export function normalizeBic(input: string, field: string): string {
  const s = asciiUpper(requireText(input, "BIC", field).replace(/\s+/g, ""));
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(s)) fail("InvalidAccount", "BIC has an invalid format.", field);
  return s;
}
