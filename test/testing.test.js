'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-test-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('207 flags a tautological assertion', () => {
  assert.ok(ids(tmpFile('a.test.js', "test('x', () => { expect(true).toBe(true); });\n")).includes('207'));
  assert.ok(ids(tmpFile('b.test.js', "test('x', () => { expect(result).toEqual(result); });\n")).includes('207'));
  assert.ok(!ids(tmpFile('c.test.js', "test('x', () => { expect(sum(2,2)).toBe(4); });\n")).includes('207'), 'a real assertion is fine');
});

test('208 flags an assertion with no matcher', () => {
  assert.ok(ids(tmpFile('a.test.js', 'expect(value);\n')).includes('208'));
  assert.ok(!ids(tmpFile('b.test.js', 'expect(value).toBe(3);\n')).includes('208'), 'a matcher is fine');
});

test('209 flags a sleep-based test wait', () => {
  assert.ok(ids(tmpFile('a.test.js', 'await sleep(500);\n')).includes('209'));
  assert.ok(ids(tmpFile('b.spec.js', 'setTimeout(done, 2000);\n')).includes('209'));
});

test('testOnly detectors do not fire in production code', () => {
  assert.ok(!ids(tmpFile('app.js', 'expect(value);\n')).includes('208'), 'not a test file');
  assert.ok(!ids(tmpFile('svc.js', 'await sleep(500);\n')).includes('209'));
});

test('210 flags dead code behind if (false), anywhere', () => {
  assert.ok(ids(tmpFile('app.js', 'if (false) { doStuff(); }\n')).includes('210'));
});

test('testing detectors carry the testing category', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const id of ['207', '208', '209']) assert.strictEqual(all.find((r) => r.id === id).category, 'testing');
});
