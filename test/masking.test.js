'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { commentMask } = require('../src/mask');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-mask-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('Python # comments are masked (a token mentioned in a comment is not code)', () => {
  const got = ids(tmpFile('a.py', 'def f(x):\n    # avoid eval( and == None here\n    return x is None\n'));
  assert.ok(!got.includes('153') && !got.includes('152'), 'comment mentions are not findings');
});

test('Python docstrings are masked', () => {
  const got = ids(tmpFile('a.py', 'def f(x):\n    """Mentions eval(), print(), and x == None on purpose."""\n    return x\n'));
  assert.deepStrictEqual(got.filter((i) => ['152', '153', '178'].includes(i)), [], 'docstring text is not code');
});

test('codeOnly rules ignore a construct named inside a string literal', () => {
  assert.ok(!ids(tmpFile('a.js', 'const help = "use eval() carefully";\n')).includes('172'), 'eval in a string is prose');
  assert.ok(!ids(tmpFile('b.py', 'MSG = "call print() to debug"\n')).includes('178'), 'print in a string is prose');
  assert.ok(!ids(tmpFile('c.py', 'ERR = "x == None is invalid"\n')).includes('152'), '== None in a string is prose');
});

test('real code still fires after masking', () => {
  const got = ids(tmpFile('a.py', 'r = eval(user_input)\nprint("debug", data)\nif x == None:\n    pass\n'));
  for (const id of ['153', '178', '152']) assert.ok(got.includes(id), `${id} still fires on real code`);
});

test('057 matches a TODO in a comment, not a TODO data value or enum', () => {
  const got = scan(tmpFile('a.ts', "const s = { TODO: 'To do' };\ntype S = 'TODO' | 'DONE';\n// TODO: implement\n")).findings.filter((f) => f.id === '057');
  assert.strictEqual(got.length, 1, 'only the comment marker');
  assert.strictEqual(got[0].line, 3);
});

test('a // inside a string still does not start a comment', () => {
  // regression: the URL\'s // must not mask the real `any` later on the line
  assert.ok(ids(tmpFile('a.ts', 'const url = "http://x.com"; const k: any = 1;\n')).includes('054'));
});

test('commentMask classifies code/comment/string (tri-state)', () => {
  const m = commentMask(['x = "s" # c'], '.py');
  assert.strictEqual(m[0][0], 0, 'x is code');
  assert.strictEqual(m[0][4], 2, 'inside the string');
  assert.strictEqual(m[0][8], 1, 'inside the # comment');
});
