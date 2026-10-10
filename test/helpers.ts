import { SpaydError } from "../src/index.js";

/** Runs `fn` and returns the `code` of the thrown SpaydError (or fails the test). */
export function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof SpaydError) return err.code;
    throw err;
  }
  throw new Error("expected a SpaydError, but nothing was thrown");
}
