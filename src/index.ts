export { SpaydError, isSpaydError } from "./errors.js";
export type { ErrorCode, Result } from "./errors.js";

export {
  buildSpayd,
  computeSpaydCrc32,
  isValidSpayd,
  parseSpayd,
  tryBuildSpayd,
  tryParseSpayd,
} from "./spayd.js";
export type {
  AccountInput,
  BuildOptions,
  Frequency,
  ParseOptions,
  SpaydAccount,
  SpaydInput,
  SpaydPayment,
} from "./spayd.js";
export type { DomesticAccount } from "./account.js";

export { SPAYD_FIELD_LIMITS, SPAYD_FILE_EXTENSION, SPAYD_MIME_TYPE } from "./fields.js";
export type { SpaydKey } from "./fields.js";

export { crc32 } from "./crc32.js";
export { decodeValue, encodeValue, toAlphanumericText } from "./encoding.js";
export type { TextEncoding } from "./encoding.js";
