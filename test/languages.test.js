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

test('178 flags a Python print (detector only — never auto-deleted)', () => {
  assert.ok(ids(tmpFile('a.py', 'def f():\n    print("debug", x)\n    return x\n')).includes('178'));
  // 178 has NO fixer: deleting a print can empty a Python block. The fix engine
  // must leave the file untouched even when asked explicitly.
  const f = tmpFile('b.py', 'def f():\n    print("debug")\n    return 1\n');
  const before = fs.readFileSync(f, 'utf8');
  applyPlan(planFixes(scan([path.dirname(f)], { ignoreBase: path.dirname(f) }), { only: ['178'] }));
  assert.strictEqual(fs.readFileSync(f, 'utf8'), before, '178 is detector-only; nothing removed');
});

test('178 does not flag print used as a non-call identifier, a method, or a def', () => {
  assert.ok(!ids(tmpFile('a.py', 'pprinter = make_printer()\n')).includes('178'), 'pprinter is not print(');
  assert.ok(!ids(tmpFile('b.py', 'log.print("x")\n')).includes('178'), 'a .print() method call is not the builtin');
  assert.ok(!ids(tmpFile('c.py', 'class L:\n    def print(self, m):\n        self.out.append(m)\n')).includes('178'), 'a def print(self) method');
  assert.ok(ids(tmpFile('d.py', 'print("real debug")\n')).includes('178'), 'the builtin print still fires');
});

test('179 flags == True/False and fix strips the removable forms', () => {
  assert.ok(ids(tmpFile('a.py', 'if x == True:\n    pass\n')).includes('179'));
  const f = tmpFile('b.py', 'if x == True:\n    pass\n');
  assert.match(fixOne(f, '179'), /if x:/);
  const g = tmpFile('c.py', 'while a != False:\n    a = step()\n');
  assert.match(fixOne(g, '179'), /while a:/);
});

test('152/179 do NOT flag ORM Column == None / == True inside a filter', () => {
  assert.ok(!ids(tmpFile('a.py', 'q = session.query(A).filter(A.name == None)\n')).includes('152'), 'SQLAlchemy IS NULL is required');
  assert.ok(!ids(tmpFile('b.py', 'q = session.query(A).filter(A.active == True)\n')).includes('179'), 'ORM = true is required');
  assert.ok(ids(tmpFile('c.py', 'if x == None:\n    pass\n')).includes('152'), 'a plain Python == None still fires');
});

test('180 flags Rust debug macros (detector only — dbg! can be a tail expression)', () => {
  assert.ok(ids(tmpFile('a.rs', 'fn main() {\n    dbg!(state);\n}\n')).includes('180'));
  assert.ok(ids(tmpFile('b.rs', 'fn main() {\n    println!("trace {}", x);\n}\n')).includes('180'));
  // 180 has NO fixer: removing dbg!(x) as a block's final expression changes the
  // function's return value/type. Asking to fix it must not touch the file.
  const f = tmpFile('c.rs', 'fn fib(n: u32) -> u64 {\n    dbg!(compute(n))\n}\n');
  const before = fs.readFileSync(f, 'utf8');
  applyPlan(planFixes(scan([path.dirname(f)], { ignoreBase: path.dirname(f) }), { only: ['180'] }));
  assert.strictEqual(fs.readFileSync(f, 'utf8'), before, '180 is detector-only; tail expression preserved');
});

test('181 flags a Go panic', () => {
  assert.ok(ids(tmpFile('a.go', 'func load() {\n    panic("boom")\n}\n')).includes('181'));
});

test('pytest / Go / Ruby test files are treated as the test zone', () => {
  // a pickle fixture + an assert in a pytest file must not score as production
  const r1 = scan(tmpFile('test_alpha.py', 'import pickle\ndef test_x():\n    o = pickle.loads(d)\n    assert o == None\n'));
  assert.strictEqual(r1.findings.filter((f) => f.zone !== 'test').length, 0, 'test_*.py is not production');
  const r2 = scan(tmpFile('beta_test.py', 'def beta_test():\n    print("diag")\n'));
  assert.strictEqual(r2.findings.filter((f) => f.zone !== 'test').length, 0, '*_test.py is not production');
  const r3 = scan(tmpFile('svc_test.go', 'package main\nfunc TestX() {\n    panic("x")\n}\n'));
  assert.strictEqual(r3.findings.filter((f) => f.zone !== 'test').length, 0, '*_test.go is not production');
  // a normal module is still production
  assert.ok(scan(tmpFile('service.py', 'def f():\n    print(x)\n')).findings.some((f) => f.zone !== 'test'), 'a normal module is production');
});

test('language debug-deletion rules are detector-only (no corrupting fixer)', () => {
  const { fixableIds } = require('../src/fix');
  for (const id of ['158', '178', '180']) assert.ok(!fixableIds().includes(id), `${id} must NOT have a fixer (deletion is unsafe)`);
  assert.ok(fixableIds().includes('179'), '179 (== True cleanup) is a safe, string-guarded fixer');
});
