import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

// The non-throwing API (`try*` returns a Result, `is*` returns a boolean) must
// not throw for any input, including wrongly typed values from plain
// JavaScript callers and `null` options.
const ODD: unknown[] = [
  undefined, null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, true, 10n, Symbol("x"),
  "", " ", "constructor", "__proto__", "toString", "\u212A", "x".repeat(10_000),
  {}, [], [null], Object.create(null), new Uint8Array(3), new Date(Number.NaN),
];
const SKIP = new Set<string>([]);

const fns = Object.entries(api).filter(
  ([name, fn]) => /^(try|is)[A-Z]/.test(name) && typeof fn === "function" && !SKIP.has(name),
) as Array<[string, (...args: unknown[]) => unknown]>;

const show = (v: unknown): string => (typeof v === "string" ? JSON.stringify(v.slice(0, 20)) : typeof v === "symbol" ? "symbol" : Object.prototype.toString.call(v));

describe("non-throwing API", () => {
  it.each(fns)("%s never throws", async (name, fn) => {
    for (const a of ODD) {
      for (const b of [undefined, ...ODD]) {
        const r = await fn(a, b);
        if (name.startsWith("is")) expect(typeof r, `${name}(${show(a)}, ${show(b)})`).toBe("boolean");
        else expect(typeof (r as { ok: unknown }).ok, `${name}(${show(a)}, ${show(b)})`).toBe("boolean");
      }
    }
  });
});
