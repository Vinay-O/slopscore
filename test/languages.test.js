'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { planFixes, applyPlan } = require('../src/fix');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-lang-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

// Apply a single rule's fixer to a file and return the rewritten contents.
function fixOne(file, id) {
  const dir = path.dirname(file);
  applyPlan(planFixes(scan([dir], { ignoreBase: dir }), { only: [id] }));
  return fs.readFileSync(file, 'utf8');
}

test('178 flags a Python print and fix removes a standalone one', () => {
  assert.ok(ids(tmpFile('a.py', 'def f():\n    print("debug", x)\n    return x\n')).includes('178'));
  const f = tmpFile('b.py', 'def f():\n    print("debug")\n    return 1\n');
  assert.strictEqual(fixOne(f, '178'), 'def f():\n    return 1\n');
});

test('178 does not flag print used as a non-call identifier', () => {
  assert.ok(!ids(tmpFile('a.py', 'pprinter = make_printer()\n')).includes('178'), 'pprinter is not print(');
});

test('179 flags == True/False and fix strips the removable forms', () => {
  assert.ok(ids(tmpFile('a.py', 'if x == True:\n    pass\n')).includes('179'));
  const f = tmpFile('b.py', 'if x == True:\n    pass\n');
  assert.match(fixOne(f, '179'), /if x:/);
  const g = tmpFile('c.py', 'while a != False:\n    a = step()\n');
  assert.match(fixOne(g, '179'), /while a:/);
});

test('180 flags Rust debug macros and fix removes a standalone dbg!', () => {
  assert.ok(ids(tmpFile('a.rs', 'fn main() {\n    dbg!(state);\n}\n')).includes('180'));
  assert.ok(ids(tmpFile('b.rs', 'fn main() {\n    println!("trace {}", x);\n}\n')).includes('180'));
  const f = tmpFile('c.rs', 'fn main() {\n    dbg!(state);\n    run();\n}\n');
  assert.strictEqual(fixOne(f, '180'), 'fn main() {\n    run();\n}\n');
});

test('181 flags a Go panic', () => {
  assert.ok(ids(tmpFile('a.go', 'func load() {\n    panic("boom")\n}\n')).includes('181'));
});

test('the new language fixers are wired into the fix engine', () => {
  const { fixableIds } = require('../src/fix');
  for (const id of ['178', '179', '180']) assert.ok(fixableIds().includes(id), `${id} is fixable`);
});
