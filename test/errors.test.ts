import { describe, expect, it } from "vitest";
import { SpaydError, isSpaydError, tryParseSpayd } from "../src/index.js";
import { attempt } from "../src/errors.js";

describe("errors", () => {
  it("SpaydError carries name, code, field and message", () => {
    const err = new SpaydError("FieldTooLong", "too long", "MSG");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SpaydError");
    expect(err.code).toBe("FieldTooLong");
    expect(err.field).toBe("MSG");
    expect(err.message).toBe("too long");
    expect(new SpaydError("InvalidFormat", "x").field).toBeUndefined();
  });

  it("isSpaydError narrows only library errors", () => {
    expect(isSpaydError(new SpaydError("InvalidFormat", "x"))).toBe(true);
    expect(isSpaydError(new Error("x"))).toBe(false);
    expect(isSpaydError({ code: "InvalidFormat" })).toBe(false);
    expect(isSpaydError(null)).toBe(false);
  });

  it("try* variants return library errors as results", () => {
    const r = tryParseSpayd("nope");
    expect(!r.ok && isSpaydError(r.error) && r.error.code).toBe("InvalidFormat");
  });

  it("attempt rethrows anything that is not a library error", () => {
    const bug = new TypeError("bug");
    expect(() =>
      attempt(() => {
        throw bug;
      }),
    ).toThrow(bug);
    expect(attempt(() => 1)).toEqual({ ok: true, value: 1 });
  });
});
