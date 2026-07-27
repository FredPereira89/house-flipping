// Plain Node unit test for the pure decision logic extracted from
// content.js (endpoint routing, pagination continuation, randomized delay
// bounds). No test framework dependency -- run with `node
// extension/content.logic.test.js`. Exits non-zero on any failure so it can
// be wired into CI later without adding a Chrome extension test harness.

const assert = require("node:assert");
const { resolveEndpoint, shouldPaginate, randomDelayMs } = require("./content.js");

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// --- resolveEndpoint ------------------------------------------------------

test("resolveEndpoint routes detail pages (idealista/imovirtual 'imovel' paths)", () => {
  assert.strictEqual(
    resolveEndpoint("https://www.idealista.pt/imovel/12345678/"),
    "/ingest/detail",
  );
  assert.strictEqual(
    resolveEndpoint("https://www.imovirtual.com/anuncio/imovel/T2-em-Lisboa"),
    "/ingest/detail",
  );
});

test("resolveEndpoint routes baseline pages", () => {
  assert.strictEqual(
    resolveEndpoint("https://www.idealista.pt/estatisticas-imobiliarias/lisboa/"),
    "/ingest/baselines",
  );
});

test("resolveEndpoint defaults to listings for search-result pages", () => {
  assert.strictEqual(
    resolveEndpoint("https://www.idealista.pt/comprar-casas/lisboa/"),
    "/ingest/listings",
  );
  assert.strictEqual(resolveEndpoint("https://www.olx.pt/imoveis/"), "/ingest/listings");
});

// --- shouldPaginate ---------------------------------------------------

test("shouldPaginate is true for a 'search' job under the page cap", () => {
  assert.strictEqual(shouldPaginate("search", 1, 10), true);
  assert.strictEqual(shouldPaginate("search", 9, 10), true);
});

test("shouldPaginate stops a 'search' job once the page cap is reached", () => {
  assert.strictEqual(shouldPaginate("search", 10, 10), false);
  assert.strictEqual(shouldPaginate("search", 11, 10), false);
});

test("shouldPaginate is false for 'detail' and 'baseline' jobs regardless of page cap", () => {
  assert.strictEqual(shouldPaginate("detail", 1, 10), false);
  assert.strictEqual(shouldPaginate("baseline", 1, 10), false);
});

test("shouldPaginate is false when there is no job (kind is null, e.g. plain browsing)", () => {
  assert.strictEqual(shouldPaginate(null, 1, 10), false);
});

test("shouldPaginate falls back to the module default cap (10) if pageCap is falsy", () => {
  assert.strictEqual(shouldPaginate("search", 9, undefined), true);
  assert.strictEqual(shouldPaginate("search", 10, undefined), false);
  assert.strictEqual(shouldPaginate("search", 10, 0), false);
});

// --- randomDelayMs ------------------------------------------------------

test("randomDelayMs stays within the requested [min, max) bounds across many samples", () => {
  for (let i = 0; i < 1000; i += 1) {
    const ms = randomDelayMs(3000, 7000);
    assert.ok(ms >= 3000 && ms < 7000, `expected 3000 <= ${ms} < 7000`);
  }
});

console.log(`\n${passed} passed`);
