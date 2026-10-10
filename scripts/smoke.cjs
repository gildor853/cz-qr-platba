// Runtime smoke test of the built package (CJS entry). See smoke.mjs.
"use strict";
const assert = require("node:assert/strict");
const { buildSpayd, tryParseSpayd, SpaydError } = require("cz-qr-platba");

assert.equal(buildSpayd({ iban: "CZ65 0800 0000 1920 0014 5399", amount: 450 }), "SPD*1.0*ACC:CZ6508000000192000145399*AM:450.00*CC:CZK");
const bad = tryParseSpayd("SPD*1.0*ACC:CZ6508000000192000145399*AM:1,50");
assert.equal(bad.ok, false);
assert.ok(bad.error instanceof SpaydError);
assert.equal(bad.error.code, "InvalidField");

console.log(`CJS smoke test passed on Node ${process.version}`);
