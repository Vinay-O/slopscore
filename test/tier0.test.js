'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { planFixes, applyPlan } = require('../src/fix');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-t0-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('182 flags git merge-conflict markers', () => {
  assert.ok(ids(tmpFile('a.js', '<<<<<<< HEAD\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> branch\n')).includes('182'));
  assert.ok(!ids(tmpFile('b.js', 'const line = "=======";\nconst y = a >>> 3;\n')).includes('182'), 'a shift op / short string is not a marker');
});

test('183 flags a bare @ts-ignore but not one with a reason', () => {
  assert.ok(ids(tmpFile('a.ts', '// @ts-ignore\nconst x: number = foo();\n')).includes('183'));
  assert.ok(ids(tmpFile('b.ts', '// @ts-expect-error\nconst y: number = bar();\n')).includes('183'));
  assert.ok(!ids(tmpFile('c.ts', '// @ts-expect-error legacy API returns any until v3\nconst z: number = baz();\n')).includes('183'), 'a reason exempts it');
});

test('184 flags a blanket eslint-disable but not one that names a rule', () => {
  assert.ok(ids(tmpFile('a.js', '// eslint-disable-next-line\nconst x = 1;\n')).includes('184'));
  assert.ok(ids(tmpFile('b.js', '/* eslint-disable */\nconst y = 2;\n')).includes('184'));
  assert.ok(!ids(tmpFile('c.js', '// eslint-disable-next-line no-console -- deliberate CLI output\nconsole.log(1);\n')).includes('184'), 'a named rule is fine');
  assert.ok(!ids(tmpFile('d.js', 'const s = "run eslint-disable to skip";\n')).includes('184'), 'a prose mention is not a directive');
});

test('185 flags and auto-removes a debugger statement', () => {
  const f = tmpFile('a.js', 'function go() {\n  debugger;\n  return 1;\n}\n');
  assert.ok(ids(f).includes('185'));
  applyPlan(planFixes(scan([path.dirname(f)], { ignoreBase: path.dirname(f) }), { only: ['185'] }));
  const after = fs.readFileSync(f, 'utf8');
  assert.ok(!/debugger/.test(after), 'debugger line was removed');
  assert.match(after, /return 1;/, 'surrounding code preserved');
});

test('185 ignores the word debugger in a comment or string', () => {
  assert.ok(!ids(tmpFile('a.js', '// launch the debugger here\nconst x = 1;\n')).includes('185'));
  assert.ok(!ids(tmpFile('b.js', 'const msg = "open the debugger";\n')).includes('185'));
});

test('186 flags focused tests', () => {
  assert.ok(ids(tmpFile('a.test.js', "it.only('works', () => {});\n")).includes('186'));
  assert.ok(ids(tmpFile('b.test.js', "describe.only('suite', () => {});\n")).includes('186'));
  assert.ok(ids(tmpFile('c.test.js', "fit('fast', () => {});\n")).includes('186'));
  assert.ok(!ids(tmpFile('d.test.js', "it('works', () => {});\n")).includes('186'), 'a normal test is fine');
});

test('187 flags skipped / todo tests', () => {
  assert.ok(ids(tmpFile('a.test.js', "it.skip('later', () => {});\n")).includes('187'));
  assert.ok(ids(tmpFile('b.test.js', "test.todo('write me');\n")).includes('187'));
  assert.ok(ids(tmpFile('c.test.js', "xdescribe('off', () => {});\n")).includes('187'));
});

test('188 flags non-null assertions but not inequality', () => {
  assert.ok(ids(tmpFile('a.ts', 'const n = user!.name;\n')).includes('188'));
  assert.ok(ids(tmpFile('b.ts', 'const r = getThing()!();\n')).includes('188'));
  assert.ok(!ids(tmpFile('c.ts', 'if (a != b && c !== d) return;\n')).includes('188'), '!= / !== are not assertions');
  assert.ok(!ids(tmpFile('d.d.ts', 'export const x: string;\n')).includes('188'), 'declaration files are exempt');
});

test('189 flags @ts-nocheck', () => {
  assert.ok(ids(tmpFile('a.ts', '// @ts-nocheck\nexport const x = 1;\n')).includes('189'));
});

test('190 flags process.exit in app code but not in bin/ or scripts/', () => {
  assert.ok(ids(tmpFile('app.js', 'function fail() { process.exit(1); }\n')).includes('190'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-bin-'));
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin', 'cli.js'), 'process.exit(0);\n');
  assert.ok(!scan([dir], { ignoreBase: dir }).findings.some((f) => f.id === '190'), 'entry points may exit');
});
