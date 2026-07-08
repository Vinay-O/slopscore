'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-q-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('222 flags Function/Object as a type, not Object.method', () => {
  assert.ok(ids(tmpFile('a.ts', 'const cb: Function = () => {};\n')).includes('222'));
  assert.ok(ids(tmpFile('b.ts', 'function f(x: Object) { return x; }\n')).includes('222'));
  assert.ok(!ids(tmpFile('c.ts', 'const keys = Object.keys(obj);\n')).includes('222'), 'Object.keys is a value');
});

test('223 flags var', () => {
  assert.ok(ids(tmpFile('a.js', 'var x = 1;\n')).includes('223'));
  assert.ok(!ids(tmpFile('b.js', 'const x = 1;\nlet y = 2;\n')).includes('223'));
});

test('224 flags loose equality but exempts == null', () => {
  assert.ok(ids(tmpFile('a.js', 'if (a == b) run();\n')).includes('224'));
  assert.ok(ids(tmpFile('b.js', 'if (x != y) run();\n')).includes('224'));
  assert.ok(!ids(tmpFile('c.js', 'if (x == null) run();\n')).includes('224'), '== null is the accepted idiom');
  assert.ok(!ids(tmpFile('d.js', 'if (a === b && c !== d) run();\n')).includes('224'), 'strict equality is fine');
});

test('225 flags an empty function body', () => {
  assert.ok(ids(tmpFile('a.js', 'function noop() {}\n')).includes('225'));
});

test('226 flags return await', () => {
  assert.ok(ids(tmpFile('a.js', 'async function f() { return await g(); }\n')).includes('226'));
});
