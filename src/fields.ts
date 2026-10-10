/**
 * Attribute keys and maximum lengths from the ČBA standard "Formát pro sdílení platebních
 * údajů v rámci tuzemského platebního styku v CZK prostřednictvím QR kódů", version 1.2
 * (Table 1: basic attributes, Table 2: Czech extensions).
 */
export const SPAYD_FIELD_LIMITS = Object.freeze({
  ACC: 46,
  "ALT-ACC": 93,
  AM: 10,
  CC: 3,
  RF: 16,
  RN: 35,
  DT: 8,
  PT: 3,
  MSG: 60,
  CRC32: 8,
  NT: 1,
  NTA: 320,
  DL: 8,
  FRQ: 3,
  DH: 1,
  "X-PER": 2,
  "X-VS": 10,
  "X-SS": 10,
  "X-KS": 10,
  "X-ID": 20,
  "X-URL": 140,
  "X-SELF": 60,
} as const);

/** A key defined by the standard. */
export type SpaydKey = keyof typeof SPAYD_FIELD_LIMITS;

/** @internal Output order of the builder; matches the examples in the standard. */
export const OUTPUT_ORDER: readonly SpaydKey[] = [
  "ACC",
  "ALT-ACC",
  "AM",
  "CC",
  "RF",
  "RN",
  "X-VS",
  "X-SS",
  "X-KS",
  "FRQ",
  "DT",
  "DL",
  "DH",
  "PT",
  "NT",
  "NTA",
  "X-PER",
  "X-ID",
  "X-URL",
  "X-SELF",
  "MSG",
];

/** @internal */
export function isStandardKey(key: string): key is SpaydKey {
  return Object.prototype.hasOwnProperty.call(SPAYD_FIELD_LIMITS, key);
}

/** MIME type defined by the standard for stored SPAYD strings. */
export const SPAYD_MIME_TYPE = "application/x-shortpaymentdescriptor";
/** File extension defined by the standard. */
export const SPAYD_FILE_EXTENSION = ".spayd";
