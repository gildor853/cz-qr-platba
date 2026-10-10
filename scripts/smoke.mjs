// Runtime smoke test of the built package (ESM entry), run by CI on Node
// versions the test runner no longer supports. No dependencies, no network.
// The bare specifier resolves to ./dist through the package's "exports" map.
import assert from "node:assert/strict";
import { buildSpayd, crc32, parseSpayd } from "cz-qr-platba";

const EX = "SPD*1.0*ACC:CZ3301000000000002970297*AM:555.55*CC:CZK*RF:7004139146*X-VS:0987654321*X-SS:1234567890*X-KS:0558*DT:20210430*MSG:PRISPEVEK NA NADACI";
assert.equal(buildSpayd(parseSpayd(EX)), EX);
assert.equal(crc32("123456789"), "CBF43926");
const s = buildSpayd({ account: "19-2000145399/0800", amount: 1499.9, vs: "2026001", message: "Faktura č. 1 * test", crc32: true });
assert.match(s, /^SPD\*1\.0\*ACC:CZ6508000000192000145399\*AM:1499\.90\*/);
const p = parseSpayd(s);
assert.equal(p.message, "Faktura č. 1 * test");
assert.equal(p.crc32, true);

console.log(`ESM smoke test passed on Node ${process.version}`);
