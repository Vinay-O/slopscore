'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-eslint-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

const ids = (r) => r.findings.map((f) => f.id);

test('eslint-disable-next-line for the matching rule suppresses `any` (054)', () => {
  const p = tmpFile('a.ts', '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nconst x = y as any;\n');
  assert.ok(!ids(scan(p)).includes('054'));
});

test('eslint-disable-line for the matching rule suppresses `any` (054)', () => {
  const p = tmpFile('a.ts', 'const x = y as any; // eslint-disable-line @typescript-eslint/no-explicit-any\n');
  assert.ok(!ids(scan(p)).includes('054'));
});

test('eslint-disable-next-line no-console suppresses console.log (052)', () => {
  const p = tmpFile('a.ts', '// eslint-disable-next-line no-console\nconsole.log("debug");\n');
  assert.ok(!ids(scan(p)).includes('052'));
});

test('a DIFFERENT disabled eslint rule does not suppress the finding', () => {
  const p = tmpFile('a.ts', '// eslint-disable-next-line no-unused-vars\nconst x = y as any;\n');
  assert.ok(ids(scan(p)).includes('054'), 'no-unused-vars must not silence an `any` finding');
});

test('a bare eslint-disable-next-line suppresses `any` but NOT a security finding', () => {
  // eval-on-dynamic-input (172) is security: an eslint-disable must never hide it.
  const p = tmpFile('a.ts', '// eslint-disable-next-line\nconst r = eval(userInput); const x = y as any;\n');
  const got = ids(scan(p));
  assert.ok(!got.includes('054'), 'bare eslint-disable should silence `any`');
  assert.ok(got.includes('172'), 'a bare eslint-disable must NOT silence eval (security)');
});

test('eslint-disable-line no-eval does NOT suppress the eval security finding (172)', () => {
  const p = tmpFile('a.ts', 'const r = eval(userInput); // eslint-disable-line no-eval\n');
  assert.ok(ids(scan(p)).includes('172'), 'security findings are never eslint-suppressible');
});
