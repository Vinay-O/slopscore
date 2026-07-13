'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../scripts/precision-recall');

// Regression guard on the tool's own false-positive / false-negative rate against a
// labeled corpus (seeded vulnerabilities + tempting-but-safe hard negatives). If a
// change starts crying wolf on safe code (precision drops) or misses a seeded vuln
// (recall drops), this fails.
test('precision/recall on the labeled corpus stays at/above 0.95', () => {
  const r = evaluate();
  assert.ok(r.precision >= 0.95, `precision ${r.precision} — false positives: ${JSON.stringify(r.rows.filter((x) => x.falses.length))}`);
  assert.ok(r.recall >= 0.95, `recall ${r.recall} — misses: ${JSON.stringify(r.rows.filter((x) => x.misses.length))}`);
});
