/**
 * Machine-readable reasons why building or parsing a SPAYD string failed.
 *
 * - `InvalidFormat`: the string is not a SPAYD string (header, version, `KEY:VALUE` structure).
 * - `UnknownKey`: an attribute key that is neither in the standard nor an `X-` extension.
 * - `DuplicateKey`: the same key appears twice.
 * - `MissingField`: a mandatory field (the account) is missing.
 * - `InvalidField`: a value has the wrong format (amount, date, symbol, enum, escaping, …).
 * - `FieldTooLong`: a value exceeds the maximum length from the standard.
 * - `InvalidAccount`: IBAN, BIC or domestic account number is invalid.
 * - `InvalidChecksum`: the `CRC32` attribute does not match the content.
 */
export type ErrorCode =
  | "InvalidFormat"
  | "UnknownKey"
  | "DuplicateKey"
  | "MissingField"
  | "InvalidField"
  | "FieldTooLong"
  | "InvalidAccount"
  | "InvalidChecksum";

/**
 * The single error class thrown by {@link buildSpayd} and {@link parseSpayd}.
 * `field` names the SPAYD key involved (e.g. `"AM"`, `"X-VS"`), when there is one.
 */
export class SpaydError extends Error {
  readonly code: ErrorCode;
  readonly field: string | undefined;

  constructor(code: ErrorCode, message: string, field?: string) {
    super(message);
    this.name = "SpaydError";
    this.code = code;
    this.field = field;
  }
}

/** Result object returned by every `try*` function. Never throws for invalid input. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SpaydError };

/** Narrowing helper: `true` when `err` is a {@link SpaydError}. */
export function isSpaydError(err: unknown): err is SpaydError {
  return err instanceof SpaydError;
}

/** @internal */
export function fail(code: ErrorCode, message: string, field?: string): never {
  throw new SpaydError(code, message, field);
}

/** @internal Wraps a throwing function into a `Result`. */
export function attempt<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (err instanceof SpaydError) return { ok: false, error: err };
    throw err;
  }
}
