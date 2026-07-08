'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { scan } = require('../src/scanner');

const BIN = path.resolve(__dirname, '..', 'bin', 'slopscore.js');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-rob-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('195 flags parseInt without a radix, not with one', () => {
  assert.ok(ids(tmpFile('a.js', 'const n = parseInt(raw);\n')).includes('195'));
  assert.ok(!ids(tmpFile('b.js', 'const n = parseInt(raw, 10);\n')).includes('195'), 'explicit radix is fine');
});

test('196 flags RegExp built from user input, not from a literal', () => {
  assert.ok(ids(tmpFile('a.js', 'const re = new RegExp(req.query.q);\n')).includes('196'));
  assert.ok(ids(tmpFile('b.js', 'const re = new RegExp(userInput);\n')).includes('196'));
  assert.ok(!ids(tmpFile('c.js', 'const re = new RegExp("a+b*");\n')).includes('196'), 'a literal pattern is fine');
});

test('197 flags an unchecked find/match dereference', () => {
  assert.ok(ids(tmpFile('a.js', 'const name = users.find(u => u.id === id).name;\n')).includes('197'));
  assert.ok(ids(tmpFile('b.js', 'const first = str.match(/\\d+/)[0];\n')).includes('197'));
  assert.ok(!ids(tmpFile('c.js', 'const m = str.match(/\\d+/);\nif (m) use(m[0]);\n')).includes('197'), 'a guarded result is fine');
});

test('198 flags JSON.parse of external data', () => {
  assert.ok(ids(tmpFile('a.js', 'const d = JSON.parse(await res.text());\n')).includes('198'));
  assert.ok(ids(tmpFile('b.js', 'const d = JSON.parse(localStorage.getItem("k"));\n')).includes('198'));
  assert.ok(!ids(tmpFile('c.js', 'const d = JSON.parse(myKnownConstant);\n')).includes('198'), 'a local constant is not the external-data case');
});

test('robustness detectors carry the robustness category', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const id of ['195', '196', '197', '198']) {
    assert.strictEqual(all.find((r) => r.id === id).category, 'robustness', `${id} is robustness`);
  }
});

test('slopscore gate fails on a production robustness blocker and passes when clean', () => {
  const bad = tmpFile('svc.js', 'export function h(req) { return new RegExp(req.query.q); }\n');
  let failed = false;
  try { execFileSync('node', [BIN, 'gate', bad], { encoding: 'utf8' }); }
  catch (e) { failed = true; assert.match(e.stdout || '', /NOT ship-ready/); }
  assert.ok(failed, 'gate exits non-zero on a security/robustness blocker');

  const good = tmpFile('clean.js', 'export const add = (a, b) => a + b;\n');
  const out = execFileSync('node', [BIN, 'gate', good], { encoding: 'utf8' });
  assert.match(out, /Ship-ready/);
});
