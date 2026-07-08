'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-err-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('218 flags a swallowed promise rejection', () => {
  assert.ok(ids(tmpFile('a.js', 'doThing().catch(() => {});\n')).includes('218'));
  assert.ok(ids(tmpFile('b.js', 'doThing().catch(console.log);\n')).includes('218'));
  assert.ok(!ids(tmpFile('c.js', 'doThing().catch((e) => report(e));\n')).includes('218'), 'a real handler is fine');
});

test('219 flags throwing a string, not an Error', () => {
  assert.ok(ids(tmpFile('a.js', 'if (bad) throw "nope";\n')).includes('219'));
  assert.ok(!ids(tmpFile('b.js', 'if (bad) throw new Error("nope");\n')).includes('219'), 'throw new Error is fine');
  assert.ok(!ids(tmpFile('c.js', 'const s = "throw \'x\'";\n')).includes('219'), 'a string mentioning throw is prose');
});

test('220 flags a generic error message', () => {
  assert.ok(ids(tmpFile('a.tsx', 'const msg = "Something went wrong";\n')).includes('220'));
});

test('221 flags a global uncaughtException handler', () => {
  assert.ok(ids(tmpFile('a.js', "process.on('uncaughtException', (e) => log(e));\n")).includes('221'));
});
