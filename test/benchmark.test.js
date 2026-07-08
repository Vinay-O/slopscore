'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { densityOf } = require('../scripts/benchmark');

// Regression guard: the labeled corpus must keep discriminating. If a future
// change makes idiomatic code noisy (clean > 0) or silences the sloppy sample
// (slop low), this fails — a check on the tool's core promise.
const root = path.join(__dirname, 'corpus');

test('benchmark: clean corpus produces zero findings (no false positives)', () => {
  const clean = densityOf(path.join(root, 'clean'));
  assert.strictEqual(clean.findings, 0, 'idiomatic code must stay clean');
  assert.strictEqual(clean.weighted, 0);
});

test('benchmark: slop corpus lights up (detectors fire)', () => {
  const slop = densityOf(path.join(root, 'slop'));
  assert.ok(slop.findings >= 8, `slop corpus should surface many findings (got ${slop.findings})`);
  assert.ok(slop.weighted >= 30, `slop corpus should carry real weight (got ${slop.weighted})`);
});
