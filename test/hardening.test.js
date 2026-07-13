'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { looksReDoS, buildCustomRules } = require('../src/rules');
const { looksBinary } = require('../src/sanitize');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-hard-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

test('looksReDoS flags nested quantifiers, not safe patterns', () => {
  assert.ok(looksReDoS('(a+)+'));
  assert.ok(looksReDoS('(.*)*'));
  assert.ok(looksReDoS('(\\d+)*'));
  assert.ok(!looksReDoS('(abc)+'), 'a quantified literal group is linear');
  assert.ok(!looksReDoS('bannedApi\\('), 'ordinary pattern is fine');
});

test('buildCustomRules skips a ReDoS-prone custom rule', () => {
  const built = buildCustomRules([
    { id: '901', pattern: '(a+)+', fix: 'x' },       // ReDoS → skipped
    { id: '902', pattern: 'bannedApi\\(', fix: 'y' }, // fine → kept
  ]);
  assert.deepStrictEqual(built.map((r) => r.id), ['902']);
});

test('a ReDoS custom rule does not hang the scan (skipped, not run)', () => {
  const f = tmpFile('a.js', `const s = "${'a'.repeat(40)}";\n`);
  const findings = scan([path.dirname(f)], {
    ignoreBase: path.dirname(f),
    customRules: [{ id: '903', pattern: '(a+)+$', fix: 'x' }],
  }).findings;
  assert.ok(!findings.some((x) => x.id === '903'), 'ReDoS rule was skipped');
});

test('looksBinary detects NUL bytes and heavy replacement-char density', () => {
  assert.ok(looksBinary('abc\u0000def'));
  assert.ok(looksBinary('\uFFFD'.repeat(50) + 'x'));
  assert.ok(!looksBinary('const ok = 1;\n'));
  assert.ok(!looksBinary('café — a normal unicode line'));
});

test('a non-UTF-8 / binary file is skipped by the scanner', () => {
  const p = tmpFile('blob.js', 'const k = "AKIA1234567890ABCDEF";\n' + '\uFFFD'.repeat(200));
  assert.strictEqual(scan(p).findings.length, 0, 'garbage-encoded file is not scanned');
});
