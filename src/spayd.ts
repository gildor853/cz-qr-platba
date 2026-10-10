import { domesticToIban, ibanToDomestic, normalizeBic, normalizeIban, parseDomesticAccount, type DomesticAccount } from "./account.js";
import { crc32 } from "./crc32.js";
import { charLength, decodeValue, encodeValue, toAlphanumericText, truncateChars, type TextEncoding } from "./encoding.js";
import { attempt, fail, type Result } from "./errors.js";
import { OUTPUT_ORDER, SPAYD_FIELD_LIMITS, isStandardKey, type SpaydKey } from "./fields.js";

/** Standing-order frequency (`FRQ`). */
export type Frequency = "1D" | "1M" | "3M" | "6M" | "1Y";

/** An account given as IBAN (optionally with BIC) or as a Czech domestic account. */
export type AccountInput =
  | string
  | { readonly iban: string; readonly bic?: string | undefined }
  | { readonly account: string; readonly bankCode?: string | undefined; readonly bic?: string | undefined };

/** Input of {@link buildSpayd}. Exactly one of `iban` or `account` is required. */
export interface SpaydInput {
  /** `"payment"` (default, header `SPD`, also standing orders) or `"collection"` (header `SCD`, consent to direct debit). */
  readonly kind?: "payment" | "collection" | undefined;
  /** Recipient IBAN (`ACC`); spaces allowed. */
  readonly iban?: string | undefined;
  /** Domestic account `[prefix-]number/bankCode`, or `[prefix-]number` with `bankCode`. Converted to IBAN. */
  readonly account?: string | undefined;
  /** Bank code for `account` when it is not part of the string. */
  readonly bankCode?: string | undefined;
  /** Optional BIC appended to `ACC` as `IBAN+BIC`. */
  readonly bic?: string | undefined;
  /** Alternative accounts (`ALT-ACC`); IBAN strings, `{ iban, bic }` or `{ account, bankCode }`. */
  readonly alternateAccounts?: readonly AccountInput[] | undefined;
  /** Amount (`AM`): number or decimal string with at most 2 decimals, `0 < amount ≤ 9 999 999.99`. Written with 2 decimals. */
  readonly amount?: number | string | undefined;
  /** ISO 4217 currency (`CC`), default `"CZK"` (the standard currently allows only CZK). `null` omits the field. */
  readonly currency?: string | null | undefined;
  /** Payment identifier for the recipient (`RF`), up to 16 digits. */
  readonly reference?: string | number | undefined;
  /** Recipient name (`RN`), up to 35 characters. */
  readonly recipientName?: string | undefined;
  /** Due date (`DT`), `YYYY-MM-DD` or `YYYYMMDD`; for standing orders the first payment, for collections the start. */
  readonly dueDate?: string | undefined;
  /** Payment type (`PT`), up to 3 characters; `"IP"` requests an instant payment. */
  readonly paymentType?: string | undefined;
  /** Message for the recipient (`MSG`), up to 60 characters. */
  readonly message?: string | undefined;
  /** Notification channel (`NT`). */
  readonly notificationType?: "phone" | "email" | undefined;
  /** Phone number or e-mail for notifications (`NTA`), up to 320 characters. */
  readonly notificationAddress?: string | undefined;
  /** Last date of a standing order / collection consent (`DL`). */
  readonly lastDate?: string | undefined;
  /** Standing order frequency (`FRQ`); makes the payment a standing order. */
  readonly frequency?: Frequency | undefined;
  /** `DH`: `true` → `DH:1` (stop after the account holder's death), `false` → `DH:0`. Omitted when undefined. */
  readonly stopAfterDeath?: boolean | undefined;
  /** Days to retry a failed payment (`X-PER`), integer 0–30. */
  readonly retryDays?: number | undefined;
  /** Variable symbol (`X-VS`), up to 10 digits; leading zeros in strings are kept. */
  readonly vs?: string | number | undefined;
  /** Specific symbol (`X-SS`), up to 10 digits. */
  readonly ss?: string | number | undefined;
  /** Constant symbol (`X-KS`), up to 10 digits. */
  readonly ks?: string | number | undefined;
  /** Payer-side payment id (`X-ID`), up to 20 characters. */
  readonly paymentId?: string | undefined;
  /** URL (`X-URL`), up to 140 characters. */
  readonly url?: string | undefined;
  /** Message for the payer's own use (`X-SELF`), up to 60 characters. */
  readonly selfMessage?: string | undefined;
  /** Additional proprietary `X-…` attributes (keys must match `X-[A-Z-]+` and not be standard keys). */
  readonly extensions?: Readonly<Record<string, string>> | undefined;
  /** Append a `CRC32` attribute computed as described in the standard. Default `false`. */
  readonly crc32?: boolean | undefined;
}

/** Options for {@link buildSpayd}. */
export interface BuildOptions {
  /** `"percent"` (default) percent-encodes non-ASCII characters as UTF-8; `"utf8"` writes them directly. */
  readonly encoding?: TextEncoding;
  /**
   * Upper-case free-text fields and strip diacritics (`RN`, `MSG`, `X-SELF`, `X-ID`, `PT`), so the
   * string fits the alphanumeric QR mode. Default `false` (text is kept as given).
   */
  readonly alphanumeric?: boolean;
}

/** One alternative account parsed from `ALT-ACC`. */
export interface SpaydAccount {
  readonly iban: string;
  readonly bic?: string;
}

/** Result of {@link parseSpayd}. It can be passed back to {@link buildSpayd}. */
export interface SpaydPayment {
  readonly kind: "payment" | "collection";
  /** Protocol version from the header, `"1.0"`. */
  readonly version: string;
  /** Recipient IBAN, electronic format. */
  readonly iban: string;
  readonly bic?: string;
  /** Domestic form of a CZ IBAN, e.g. `{ formatted: "19-2000145399/0800", … }`; `undefined` for other countries. */
  readonly domesticAccount?: DomesticAccount;
  readonly alternateAccounts?: readonly SpaydAccount[];
  /** Amount exactly as written, e.g. `"555.55"`. */
  readonly amount?: string;
  /** Currency as written, or `null` when the string has no `CC` (so that rebuilding does not add the default). */
  readonly currency: string | null;
  readonly reference?: string;
  readonly recipientName?: string;
  /** `YYYY-MM-DD`. */
  readonly dueDate?: string;
  readonly paymentType?: string;
  readonly message?: string;
  readonly notificationType?: "phone" | "email";
  readonly notificationAddress?: string;
  /** `YYYY-MM-DD`. */
  readonly lastDate?: string;
  readonly frequency?: Frequency;
  readonly stopAfterDeath?: boolean;
  readonly retryDays?: number;
  readonly vs?: string;
  readonly ss?: string;
  readonly ks?: string;
  readonly paymentId?: string;
  readonly url?: string;
  readonly selfMessage?: string;
  /** Unknown `X-…` attributes, decoded. */
  readonly extensions?: Readonly<Record<string, string>>;
  /** `true` when the string carried a `CRC32` attribute (which was verified). */
  readonly crc32: boolean;
  /** The `CRC32` value as written, when present. */
  readonly checksum?: string;
  /** All attributes in their original order: key, decoded value, raw (still encoded) value. */
  readonly attributes: ReadonlyArray<readonly [key: string, value: string, raw: string]>;
}

/** Options for {@link parseSpayd}. */
export interface ParseOptions {
  /**
   * Over-long values: `false` (default) rejects them with `FieldTooLong`; `true` keeps only the
   * allowed number of characters from the left, as the standard tells receivers to do.
   */
  readonly truncate?: boolean;
}

const FREQUENCIES: readonly string[] = ["1D", "1M", "3M", "6M", "1Y"];
const TEXT_KEYS = new Set<SpaydKey>(["RN", "MSG", "X-SELF", "X-ID", "PT"]);

// ---------------------------------------------------------------------------
// Field-level validation shared by builder and parser (works on decoded values)

function checkLength(key: string, value: string, truncate = false): string {
  const max = isStandardKey(key) ? SPAYD_FIELD_LIMITS[key] : undefined;
  if (max !== undefined && charLength(value) > max) {
    if (truncate) return truncateChars(value, max);
    fail("FieldTooLong", `${key} can have at most ${max} characters, got ${charLength(value)}.`, key);
  }
  return value;
}

function checkDigitsField(key: SpaydKey, value: string): string {
  if (!/^\d+$/.test(value)) fail("InvalidField", `${key} must contain digits only.`, key);
  return value;
}

function checkDate(key: string, value: string): string {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
  if (!m || (value.includes("-") && value.length !== 10)) fail("InvalidField", `${key} must be a date YYYY-MM-DD or YYYYMMDD.`, key);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (mo < 1 || mo > 12 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    fail("InvalidField", `${key} is not a valid calendar date.`, key);
  return `${m[1]}${m[2]}${m[3]}`;
}

const isoDate = (yyyymmdd: string): string => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}`;

function checkAmountString(value: string): string {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) fail("InvalidField", "AM must be a decimal number with a dot and at most 2 decimals.", "AM");
  return value;
}

function formatAmount(amount: number | string): string {
  let s: string;
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) fail("InvalidField", "AM must be a finite number.", "AM");
    s = String(amount);
    if (/e/i.test(s)) fail("InvalidField", "AM is out of range.", "AM");
  } else if (typeof amount === "string") {
    s = amount.trim();
  } else {
    return fail("InvalidField", "AM must be a number or a decimal string.", "AM");
  }
  if (s.startsWith("-")) fail("InvalidField", "AM must be positive.", "AM");
  checkAmountString(s);
  const [int = "0", frac = ""] = s.split(".");
  const out = `${int.replace(/^0+(?=\d)/, "")}.${frac.padEnd(2, "0")}`;
  if (/^0\.00$/.test(out)) fail("InvalidField", "AM must be greater than zero.", "AM");
  return checkLength("AM", out);
}

function digitsInput(key: SpaydKey, v: string | number): string {
  let s: string;
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v) || v < 0) fail("InvalidField", `${key} must be a non-negative integer.`, key);
    s = String(v);
  } else if (typeof v === "string") {
    s = v.trim();
  } else {
    return fail("InvalidField", `${key} must be a string or a number.`, key);
  }
  return checkLength(key, checkDigitsField(key, s));
}

// ---------------------------------------------------------------------------
// Builder

function accountToAcc(input: AccountInput, field: string): string {
  if (input === null || typeof input !== "object") {
    if (typeof input !== "string") fail("InvalidAccount", "Account must be a string or an object.", field);
    const [iban = "", bic, extra] = input.split("+");
    if (extra !== undefined) fail("InvalidAccount", "Account can contain at most one '+' (IBAN+BIC).", field);
    return bic === undefined ? normalizeIban(iban, field) : `${normalizeIban(iban, field)}+${normalizeBic(bic, field)}`;
  }
  const iban =
    "iban" in input ? normalizeIban(input.iban, field) : domesticToIban(parseDomesticAccount(input.account, input.bankCode, field));
  return input.bic === undefined ? iban : `${iban}+${normalizeBic(input.bic, field)}`;
}

/**
 * Builds a SPAYD string ("QR Platba") per the ČBA standard v1.2.
 *
 * - Attributes are written in a fixed order matching the examples in the standard, without a
 *   trailing `*`.
 * - Free text is escaped (`*` → `%2A`, `%` → `%25`, `+` → `%2B`; non-ASCII as percent-encoded
 *   UTF-8 unless `encoding: "utf8"`), surrounding whitespace is trimmed, empty strings are omitted.
 * - Length limits are checked on the unescaped text; exceeding one throws `FieldTooLong`.
 * - Keys, IBAN, BIC, currency and other coded values are upper-case.
 *
 * Render the returned string with any QR library, error-correction level M as the standard recommends.
 *
 * @throws {SpaydError}
 */
export function buildSpayd(input: SpaydInput, options: BuildOptions = {}): string {
  if (input === null || typeof input !== "object") fail("InvalidField", "buildSpayd expects an object.");
  const encoding = options?.encoding ?? "percent";
  const values = new Map<string, string>(); // key → encoded value

  const text = (key: SpaydKey, v: string | undefined): void => {
    if (v === undefined) return;
    if (typeof v !== "string") fail("InvalidField", `${key} must be a string.`, key);
    let s = v.trim();
    if (s === "") return;
    if (options?.alphanumeric && TEXT_KEYS.has(key)) s = toAlphanumericText(s);
    checkLength(key, s);
    values.set(key, encodeValue(s, encoding));
  };
  const raw = (key: SpaydKey, v: string): void => {
    values.set(key, checkLength(key, v));
  };

  // ACC
  if (input.iban !== undefined && input.account !== undefined) fail("InvalidField", "Give either iban or account, not both.", "ACC");
  if (input.iban !== undefined) raw("ACC", accountToAcc(input.bic === undefined ? { iban: input.iban } : { iban: input.iban, bic: input.bic }, "ACC"));
  else if (input.account !== undefined)
    raw("ACC", accountToAcc({ account: input.account, bankCode: input.bankCode, bic: input.bic }, "ACC"));
  else fail("MissingField", "The recipient account (iban or account) is required.", "ACC");

  if (input.alternateAccounts !== undefined && !Array.isArray(input.alternateAccounts))
    fail("InvalidField", "alternateAccounts must be an array.", "ALT-ACC");
  if (input.alternateAccounts !== undefined && input.alternateAccounts.length > 0)
    raw("ALT-ACC", input.alternateAccounts.map((a) => accountToAcc(a, "ALT-ACC")).join(","));
  if (input.amount !== undefined) raw("AM", formatAmount(input.amount));
  const cc = input.currency === undefined ? "CZK" : input.currency;
  if (cc !== null) {
    if (typeof cc !== "string" || !/^[A-Za-z]{3}$/.test(cc.trim())) fail("InvalidField", "CC must be a 3-letter ISO 4217 code.", "CC");
    raw("CC", cc.trim().toUpperCase());
  }
  if (input.reference !== undefined) raw("RF", digitsInput("RF", input.reference));
  text("RN", input.recipientName);
  if (input.vs !== undefined) raw("X-VS", digitsInput("X-VS", input.vs));
  if (input.ss !== undefined) raw("X-SS", digitsInput("X-SS", input.ss));
  if (input.ks !== undefined) raw("X-KS", digitsInput("X-KS", input.ks));
  if (input.frequency !== undefined) {
    if (!FREQUENCIES.includes(input.frequency)) fail("InvalidField", `FRQ must be one of ${FREQUENCIES.join(", ")}.`, "FRQ");
    raw("FRQ", input.frequency);
  }
  if (input.dueDate !== undefined) raw("DT", checkDate("DT", String(input.dueDate)));
  if (input.lastDate !== undefined) raw("DL", checkDate("DL", String(input.lastDate)));
  if (input.stopAfterDeath !== undefined) raw("DH", input.stopAfterDeath ? "1" : "0");
  if (input.paymentType !== undefined) {
    if (typeof input.paymentType !== "string") fail("InvalidField", "PT must be a string.", "PT");
    const pt = input.paymentType.trim().toUpperCase();
    if (pt !== "") {
      checkLength("PT", pt);
      values.set("PT", encodeValue(pt, encoding));
    }
  }
  if (input.notificationType !== undefined) {
    if (input.notificationType !== "phone" && input.notificationType !== "email")
      fail("InvalidField", 'notificationType must be "phone" or "email".', "NT");
    raw("NT", input.notificationType === "phone" ? "P" : "E");
  }
  text("NTA", input.notificationAddress);
  if (input.retryDays !== undefined) {
    if (!Number.isInteger(input.retryDays) || input.retryDays < 0 || input.retryDays > 30)
      fail("InvalidField", "X-PER must be an integer from 0 to 30.", "X-PER");
    raw("X-PER", String(input.retryDays));
  }
  text("X-ID", input.paymentId);
  text("X-URL", input.url);
  text("X-SELF", input.selfMessage);
  text("MSG", input.message);

  const attrs: Array<[string, string]> = OUTPUT_ORDER.filter((k) => values.has(k)).map((k) => [k, values.get(k)!]);
  for (const [key, value] of Object.entries(input.extensions ?? {})) {
    if (!/^X-[A-Z-]+$/.test(key)) fail("InvalidField", "Extension keys must match X-[A-Z-]+.", key);
    if (isStandardKey(key)) fail("DuplicateKey", `${key} is a standard key; use the named option instead.`, key);
    if (typeof value !== "string") fail("InvalidField", `${key} must be a string.`, key);
    const s = value.trim();
    if (s !== "") attrs.push([key, encodeValue(s, encoding)]);
  }

  const header = input.kind === "collection" ? "SCD" : input.kind === undefined || input.kind === "payment" ? "SPD" : fail("InvalidField", 'kind must be "payment" or "collection".');
  if (input.crc32) attrs.push(["CRC32", spaydCrc32(header, "1.0", attrs)]);
  return `${header}*1.0*${attrs.map(([k, v]) => `${k}:${v}`).join("*")}`;
}

/** Non-throwing variant of {@link buildSpayd}. */
export function tryBuildSpayd(input: SpaydInput, options?: BuildOptions): Result<string> {
  return attempt(() => buildSpayd(input, options));
}

/**
 * CRC32 of a SPAYD payment as described in the standard: all attributes except `CRC32`, sorted by
 * key (then by value), written as `HEADER*VERSION*KEY:VALUE*KEY:VALUE` with values in their encoded
 * form, CRC-32 of the UTF-8 bytes, 8 upper-case hex digits.
 */
function spaydCrc32(header: string, version: string, attrs: ReadonlyArray<readonly [string, string]>): string {
  const sorted = attrs
    .filter(([k]) => k !== "CRC32")
    .slice()
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return crc32(`${header}*${version}*${sorted.map(([k, v]) => `${k}:${v}`).join("*")}`);
}

/**
 * Computes the CRC32 value for an existing SPAYD string (ignoring any `CRC32` attribute in it),
 * e.g. to append one: `s + "*CRC32:" + computeSpaydCrc32(s)`.
 *
 * @throws {SpaydError} `InvalidFormat` when the string is not structurally a SPAYD string
 */
export function computeSpaydCrc32(spayd: string): string {
  const { header, version, attrs } = tokenize(spayd);
  return spaydCrc32(header, version, attrs);
}

// ---------------------------------------------------------------------------
// Parser

function tokenize(input: string): { header: "SPD" | "SCD"; version: string; attrs: Array<[string, string]> } {
  if (typeof input !== "string") fail("InvalidFormat", "Expected a string.");
  const s = input.trim().replace(/\*$/, "");
  const parts = s.split("*");
  const header = parts[0];
  if (header !== "SPD" && header !== "SCD") fail("InvalidFormat", "SPAYD string must start with SPD* or SCD*.");
  const version = parts[1];
  if (version === undefined || !/^\d+\.\d+$/.test(version)) fail("InvalidFormat", "Missing protocol version after the header.");
  if (version !== "1.0") fail("InvalidFormat", `Unsupported SPAYD version ${version}.`);
  const attrs: Array<[string, string]> = [];
  for (const part of parts.slice(2)) {
    const i = part.indexOf(":");
    if (i <= 0) fail("InvalidFormat", "Every attribute must be KEY:VALUE.");
    const key = part.slice(0, i);
    if (!/^[A-Z][A-Z0-9-]*$/.test(key)) fail("InvalidFormat", "Attribute keys are upper-case letters, digits and '-' (e.g. CRC32).", key);
    attrs.push([key, part.slice(i + 1)]);
  }
  return { header, version, attrs };
}

function parseAccValue(raw: string, field: string): SpaydAccount {
  const [iban = "", bic, extra] = raw.split("+");
  if (extra !== undefined) fail("InvalidAccount", "Account can contain at most one '+' (IBAN+BIC).", field);
  if (/\s/.test(raw)) fail("InvalidAccount", "IBAN in ACC must not contain spaces.", field);
  const out: { iban: string; bic?: string } = { iban: normalizeIban(iban, field) };
  if (iban !== out.iban) fail("InvalidAccount", "IBAN in ACC must be upper-case.", field);
  if (bic !== undefined && bic !== "") out.bic = normalizeBic(bic, field);
  return Object.freeze(out);
}

/**
 * Parses and validates a SPAYD string. The trailing `*` is optional. Percent-encoded values are
 * decoded (`+` is taken literally). Every standard field is validated like in {@link buildSpayd};
 * unknown `X-` attributes are collected in `extensions`; other unknown keys are rejected.
 * A `CRC32` attribute, when present, must match.
 *
 * `buildSpayd(parseSpayd(s))` reproduces `s` when `s` uses the builder's attribute order and
 * encoding (e.g. all examples of the standard); otherwise it yields an equivalent string.
 *
 * @throws {SpaydError}
 */
export function parseSpayd(input: string, options: ParseOptions = {}): SpaydPayment {
  const { header, version, attrs } = tokenize(input);
  const seen = new Set<string>();
  const out: Record<string, unknown> = { kind: header === "SCD" ? "collection" : "payment", version, currency: null };
  const extensions: Record<string, string> = {};
  const decodedAttrs: Array<readonly [string, string, string]> = [];
  let checksum: string | undefined;

  for (const [key, rawValue] of attrs) {
    if (seen.has(key)) fail("DuplicateKey", `${key} appears more than once.`, key);
    seen.add(key);
    if (!isStandardKey(key) && !key.startsWith("X-")) fail("UnknownKey", `Unknown attribute ${key}.`, key);
    if (/^\s|\s$/.test(rawValue)) fail("InvalidField", `${key} value must not start or end with whitespace.`, key);
    const decoded = decodeValue(rawValue, key);
    decodedAttrs.push(Object.freeze([key, decoded, rawValue] as const));
    if (decoded === "") continue; // empty value = attribute not given
    const value = checkLength(key, decoded, options?.truncate === true);

    switch (key) {
      case "ACC": {
        const acc = parseAccValue(value, key);
        out.iban = acc.iban;
        if (acc.bic !== undefined) out.bic = acc.bic;
        if (acc.iban.startsWith("CZ")) out.domesticAccount = ibanToDomestic(acc.iban);
        break;
      }
      case "ALT-ACC":
        out.alternateAccounts = Object.freeze(value.split(",").map((a) => parseAccValue(a, key)));
        break;
      case "AM":
        if (!/^\d+(?:\.\d{1,2})?$/.test(value)) fail("InvalidField", "AM must be a decimal number with a dot and at most 2 decimals.", key);
        out.amount = value;
        break;
      case "CC":
        if (!/^[A-Z]{3}$/.test(value)) fail("InvalidField", "CC must be 3 upper-case letters (ISO 4217).", key);
        out.currency = value;
        break;
      case "RF":
        out.reference = checkDigitsField(key, value);
        break;
      case "X-VS":
        out.vs = checkDigitsField(key, value);
        break;
      case "X-SS":
        out.ss = checkDigitsField(key, value);
        break;
      case "X-KS":
        out.ks = checkDigitsField(key, value);
        break;
      case "DT":
      case "DL":
        if (!/^\d{8}$/.test(value)) fail("InvalidField", `${key} must be YYYYMMDD.`, key);
        out[key === "DT" ? "dueDate" : "lastDate"] = isoDate(checkDate(key, value));
        break;
      case "FRQ":
        if (!FREQUENCIES.includes(value)) fail("InvalidField", `FRQ must be one of ${FREQUENCIES.join(", ")}.`, key);
        out.frequency = value;
        break;
      case "DH":
        if (value !== "0" && value !== "1") fail("InvalidField", "DH must be 0 or 1.", key);
        out.stopAfterDeath = value === "1";
        break;
      case "NT":
        if (value !== "P" && value !== "E") fail("InvalidField", "NT must be P or E.", key);
        out.notificationType = value === "P" ? "phone" : "email";
        break;
      case "X-PER": {
        if (!/^\d{1,2}$/.test(value) || Number(value) > 30) fail("InvalidField", "X-PER must be an integer from 0 to 30.", key);
        out.retryDays = Number(value);
        break;
      }
      case "CRC32":
        if (!/^[A-F0-9]{8}$/.test(value)) fail("InvalidField", "CRC32 must be 8 characters from [A-F0-9].", key);
        checksum = value;
        break;
      case "PT":
        out.paymentType = value;
        break;
      case "RN":
        out.recipientName = value;
        break;
      case "MSG":
        out.message = value;
        break;
      case "NTA":
        out.notificationAddress = value;
        break;
      case "X-ID":
        out.paymentId = value;
        break;
      case "X-URL":
        out.url = value;
        break;
      case "X-SELF":
        out.selfMessage = value;
        break;
      default:
        extensions[key] = value;
    }
  }

  if (out.iban === undefined) fail("MissingField", "ACC (recipient account) is required.", "ACC");
  if (checksum !== undefined) {
    const expected = spaydCrc32(header, version, attrs);
    if (expected !== checksum) fail("InvalidChecksum", "CRC32 does not match the content.", "CRC32");
    out.checksum = checksum;
  }
  out.crc32 = checksum !== undefined;
  if (Object.keys(extensions).length > 0) out.extensions = Object.freeze(extensions);
  out.attributes = Object.freeze(decodedAttrs);
  return Object.freeze(out) as unknown as SpaydPayment;
}

/** Non-throwing variant of {@link parseSpayd}. */
export function tryParseSpayd(input: string, options?: ParseOptions): Result<SpaydPayment> {
  return attempt(() => parseSpayd(input, options));
}

/** `true` when {@link parseSpayd} would succeed. */
export function isValidSpayd(input: string, options?: ParseOptions): boolean {
  return tryParseSpayd(input, options).ok;
}
