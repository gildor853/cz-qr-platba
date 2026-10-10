# cz-qr-platba

[![CI](https://github.com/gildor853/cz-qr-platba/actions/workflows/ci.yml/badge.svg)](https://github.com/gildor853/cz-qr-platba/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

Provided as is, without warranty — see [DISCLAIMER.md](./DISCLAIMER.md).

Zero-dependency TypeScript **builder and parser for Czech QR payment strings**
("QR Platba", SPAYD / Short Payment Descriptor) per the Czech Banking
Association (ČBA) standard, **version 1.2** (June 2021, effective
1 January 2022). Correct escaping, field length limits, amount formatting,
optional CRC32, and a validating parser that round-trips.

> 🇨🇿 Generování a čtení řetězců QR Platby (SPD/SCD) podle standardu ČBA
> v1.2: escapování, limity polí, formát částky, VS/SS/KS, CRC32, převod čísla
> účtu na IBAN. Bez závislostí; QR obrázek vykreslíte libovolnou knihovnou.

## Why

- **Spec-exact output**: reproduces all examples of the standard byte for
  byte (they are the test suite).
- **Safe text**: `*`, `%` and `+` are escaped, non-ASCII is percent-encoded as
  UTF-8 (or written directly if you prefer), limits are checked on the real
  text, optional transliteration for the compact alphanumeric QR mode.
- **Money done right**: amounts with at most 2 decimals, always written as
  `1234.50`; floating-point noise such as `0.1 + 0.2` is rejected, not rounded.
- **Domestic accounts**: pass `19-2000145399/0800` and get the IBAN, with the
  ČNB mod-11 check (Vyhláška 169/2011 Sb.).
- **Validating parser** with typed errors and an optional left-truncation mode
  as the standard describes for receivers.
- **No QR rendering in the core**, no dependencies: use whatever QR library
  you already have.

## Install

Not published to npm yet. Install a tagged release from GitHub (npm builds
the package during installation):

```sh
npm install github:gildor853/cz-qr-platba#v1.0.0
```

Requires Node.js 18+, or any modern browser / edge runtime (the code uses no
Node.js APIs).

The published package has no runtime dependencies and is verified on
Node.js 18 and 20 by a runtime smoke test in CI. Development (tests) needs
Node.js 22.12+, as required by vitest 5.

## Quick start

```ts
import { buildSpayd, parseSpayd } from "cz-qr-platba";

const spayd = buildSpayd({
  account: "19-2000145399/0800", // or iban: "CZ65 0800 0000 1920 0014 5399"
  amount: 1499.9,
  vs: "2026001",
  message: "Faktura 2026001",
  dueDate: "2026-10-31",
});
// "SPD*1.0*ACC:CZ6508000000192000145399*AM:1499.90*CC:CZK*X-VS:2026001*DT:20261031*MSG:Faktura 2026001"

const payment = parseSpayd(spayd);
payment.amount;                    // "1499.90"
payment.domesticAccount?.formatted; // "19-2000145399/0800"
buildSpayd(payment) === spayd;     // true
```

### Rendering the QR code

The core only produces the string. Render it with any QR library, for example
[`qrcode`](https://www.npmjs.com/package/qrcode) (not a dependency of this
package). The standard recommends error-correction level **M**:

<!-- readme-check: skip (needs the qrcode package) -->
```ts
import QRCode from "qrcode"; // npm install qrcode
import { buildSpayd } from "cz-qr-platba";

const spayd = buildSpayd({ iban: "CZ6508000000192000145399", amount: 450, message: "PLATBA ZA ZBOZI" });

const svg = await QRCode.toString(spayd, { type: "svg", errorCorrectionLevel: "M", margin: 4 });
const dataUrl = await QRCode.toDataURL(spayd, { errorCorrectionLevel: "M", width: 300 });
```

Tip: annex 1 of the standard sizes printed codes at roughly 23–58 mm per
side depending on the amount of data; upper-case ASCII text
(`{ alphanumeric: true }`) lets the QR library use the denser alphanumeric
mode.

## API reference

### `buildSpayd(input, options?)` → `string` / `tryBuildSpayd`

| Input | SPAYD key | Rules |
| --- | --- | --- |
| `kind` | header | `"payment"` → `SPD` (default; also standing orders), `"collection"` → `SCD` |
| `iban` | `ACC` | any IBAN, spaces/case ignored; CZ IBANs also get the domestic mod-11 check |
| `account`, `bankCode` | `ACC` | `[prefix-]number/bankCode` or `[prefix-]number` + `bankCode`; converted to IBAN |
| `bic` | `ACC` | appended as `IBAN+BIC` (ISO 9362 format) |
| `alternateAccounts` | `ALT-ACC` | array of IBAN strings, `{ iban, bic? }` or `{ account, bankCode?, bic? }`; max 93 chars |
| `amount` | `AM` | number or string, max 2 decimals, `> 0`, max `9999999.99`; written with 2 decimals |
| `currency` | `CC` | default `"CZK"`; `null` omits it |
| `reference` | `RF` | digits, max 16 |
| `recipientName` | `RN` | max 35 |
| `vs`, `ss`, `ks` | `X-VS`, `X-SS`, `X-KS` | digits, max 10; leading zeros in strings are kept |
| `frequency` | `FRQ` | `1D` `1M` `3M` `6M` `1Y` (standing order) |
| `dueDate`, `lastDate` | `DT`, `DL` | `YYYY-MM-DD` or `YYYYMMDD`, must be a real date |
| `stopAfterDeath` | `DH` | `true` → `1`, `false` → `0` |
| `paymentType` | `PT` | max 3, upper-cased; `"IP"` = instant payment |
| `message` | `MSG` | max 60 |
| `notificationType`, `notificationAddress` | `NT`, `NTA` | `"phone"`/`"email"` → `P`/`E`; address max 320 |
| `retryDays` | `X-PER` | integer 0–30 |
| `paymentId`, `url`, `selfMessage` | `X-ID`, `X-URL`, `X-SELF` | max 20 / 140 / 60 |
| `extensions` | `X-…` | other proprietary keys, `{ "X-FOO": "BAR" }` |
| `crc32` | `CRC32` | `true` appends the checksum (see below) |

Options: `encoding: "percent" | "utf8"` (default `"percent"`) and
`alphanumeric: boolean` (upper-case and strip diacritics in `RN`, `MSG`,
`X-SELF`, `X-ID`, `PT`).

Output: fixed attribute order matching the examples in the standard, no
trailing `*`. Free-text values are trimmed; empty strings are omitted. Length
limits count characters of the unescaped text.

### `parseSpayd(string, options?)` → `SpaydPayment` / `tryParseSpayd` / `isValidSpayd`

Returns the same field names as the builder input, plus `version`,
`domesticAccount` (for CZ IBANs), `crc32` (whether a CRC32 was present and
verified), `checksum`, `extensions` (unknown `X-` keys) and `attributes`
(every attribute in original order: key, decoded value, raw value). Amounts
and symbols stay strings, exactly as written. `currency` is `null` when the
string has no `CC`. The result can be passed straight back to `buildSpayd`.

- The trailing `*` is optional; keys must be upper-case; unknown non-`X-`
  keys, duplicates and a missing `ACC` are errors.
- `%XX` sequences are decoded as UTF-8; `+` is literal (it separates IBAN and
  BIC in `ACC`).
- Over-long values throw `FieldTooLong`, or with `{ truncate: true }` keep the
  allowed number of characters from the left, as the standard prescribes for
  receivers.
- Only version `1.0` in the header is accepted (the only one the standard defines).

### CRC32

`crc32: true` appends `CRC32:XXXXXXXX`. Following the standard: take all
attributes except `CRC32`, sort them by key (then value), write them as
`SPD*1.0*KEY:VALUE*KEY:VALUE…` with values in their encoded form, compute
CRC-32 (the common IEEE polynomial, as zlib / `java.util.zip.CRC32`) over the
UTF-8 bytes and write it as 8 upper-case hex digits. The parser verifies it
(`InvalidChecksum`). Also exported: `crc32(text)` and
`computeSpaydCrc32(spayd)`.

### Other exports

`SPAYD_FIELD_LIMITS`, `SPAYD_MIME_TYPE` (`application/x-shortpaymentdescriptor`),
`SPAYD_FILE_EXTENSION` (`.spayd`), `encodeValue`, `decodeValue`,
`toAlphanumericText`.

## Error handling

Every failure is a `SpaydError` with `code` and, where it applies, `field`
(the SPAYD key):

`InvalidFormat` · `UnknownKey` · `DuplicateKey` · `MissingField` ·
`InvalidField` · `FieldTooLong` · `InvalidAccount` · `InvalidChecksum`

```ts
import { tryBuildSpayd } from "cz-qr-platba";

// Values typed by a user:
const userIban = "CZ65 0800 0000 1920 0014 5399";
const userAmount = "250";
const note = "x".repeat(80);

const r = tryBuildSpayd({ iban: userIban, amount: userAmount, message: note });
if (!r.ok) {
  console.warn(r.error.code, r.error.field); // "FieldTooLong" "MSG"
}
r.ok; // false
```

## Sources

- Česká bankovní asociace: *Formát pro sdílení platebních údajů v rámci
  tuzemského platebního styku v CZK prostřednictvím QR kódů*, **verze 1.2**,
  June 2021 (effective 1 January 2022),
  [PDF at qr-platba.cz](https://qr-platba.cz/wp-content/uploads/1645-standard-qr-v1-2-cerven-2021.pdf);
  the examples in sections 5.2.1–5.2.4 and annex 2 are used verbatim in the
  tests.
- [qr-platba.cz – specifikace formátu](https://qr-platba.cz/pro-vyvojare/specifikace-formatu/) (web example, used in tests).
- Vyhláška ČNB č. 169/2011 Sb. (account number format, mod-11 check, CZ IBAN
  structure); ISO 13616 / ISO 7064 (IBAN check digits).
- Escaping of `+` and non-ASCII characters follows the reference
  implementation by the format's authors ([spayd/spayd-java](https://github.com/spayd/spayd-java)).

## Limitations

- The string is validated against the standard, not against a particular
  bank. Table 3–5 of the standard lists the fields every Czech bank processes
  (`ACC`, `AM`, `CC`, `DT`, `MSG`, `X-VS`, `X-SS`, `X-KS`, and `FRQ`/`DL` for
  standing orders); other fields may be ignored by some banking apps.
- The standard allows only CZK at present; other ISO 4217 codes are accepted
  syntactically.
- The standard contains no CRC32 test vector and does not say whether the
  canonical string ends with `*`; this library uses no trailing `*`, matching
  how SPAYD strings are written. Verify interoperability with your bank before
  relying on `crc32: true`.
- No QR rendering, no SEPA/EPC QR (`BCD`) format.

## Disclaimer

**Use at your own risk.** This software is provided as is, without warranty of any kind. Wrong payment details can misdirect money; this is not financial advice. Verify codes in a real banking app. See the full legal text in [DISCLAIMER.md](./DISCLAIMER.md).

## Contributing

This repository is maintained by a single author and does not accept external
contributions; issues and pull requests are limited to collaborators.

Security problems can be reported privately, see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © 2026 Gildor
