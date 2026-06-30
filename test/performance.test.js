'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-perf-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('175 flags JSON deep-clone round-trip', () => {
  assert.ok(ids(tmpFile('a.js', 'const copy = JSON.parse(JSON.stringify(state));\n')).includes('175'));
  assert.ok(!ids(tmpFile('b.js', 'const data = JSON.parse(text);\n')).includes('175'), 'a plain parse is fine');
});

test('176 flags SELECT *', () => {
  assert.ok(ids(tmpFile('a.js', 'const q = "SELECT * FROM orders";\n')).includes('176'));
  assert.ok(!ids(tmpFile('b.js', 'const q = "SELECT id, total FROM orders";\n')).includes('176'), 'explicit columns are fine');
});

test('177 flags forEach with an async callback', () => {
  assert.ok(ids(tmpFile('a.js', 'items.forEach(async (it) => { await save(it); });\n')).includes('177'));
  assert.ok(!ids(tmpFile('b.js', 'items.forEach((it) => render(it));\n')).includes('177'), 'a sync callback is fine');
});

test('the performance category groups its detectors (incl. 093)', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  const perf = all.filter((r) => r.category === 'performance').map((r) => r.id).sort();
  for (const id of ['093', '175', '176', '177']) assert.ok(perf.includes(id), `${id} is performance`);
});

test('--category performance focuses the run', () => {
  const dir = path.dirname(tmpFile('seed.js', '\n'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'const copy = JSON.parse(JSON.stringify(x));\nconsole.log("debug");\n');
  const r = scan([dir], { ignoreBase: dir }).findings;
  assert.ok(r.some((f) => f.id === '175') && r.some((f) => f.id === '052'), 'both fire unfiltered');
});
