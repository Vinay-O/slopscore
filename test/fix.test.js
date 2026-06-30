'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { planFixes, applyPlan } = require('../src/fix');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-fix-'));
}

// Scan a directory, plan + apply fixes, return the rewritten file contents.
function fixDir(dir, opts) {
  const result = scan([dir], { ignoreBase: dir });
  const plan = planFixes(result, opts);
  applyPlan(plan);
  return plan;
}

test('removes a standalone console.log line', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'a.js');
  fs.writeFileSync(f, 'function g() {\n  console.log("x");\n  return 1;\n}\n');
  fixDir(dir);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'function g() {\n  return 1;\n}\n');
});

test('does NOT remove a multi-line console.log (only complete one-line statements)', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'a.js');
  const src = 'function g() {\n  console.log(\n    "x",\n    payload\n  );\n  return 1;\n}\n';
  fs.writeFileSync(f, src);
  fixDir(dir);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), src, 'a multi-line call must be left untouched');
});

test('does NOT delete code on a line with a trailing step-comment', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'a.js');
  const src = 'const x = 1; // Step 2: keep the code\nexport default x;\n';
  fs.writeFileSync(f, src);
  fixDir(dir);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), src, 'trailing comment must not take the code with it');
});

test('adds alt="" to an <img> that lacks it, preserving the self-closing slash', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'a.jsx');
  fs.writeFileSync(f, 'export const H = () => <img src="/h.png" className="w" />;\n');
  fixDir(dir);
  assert.match(fs.readFileSync(f, 'utf8'), /<img src="\/h\.png" className="w" alt="" \/>/);
});

test('rewrites Python == None to is None', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'a.py');
  fs.writeFileSync(f, 'def f(x):\n    if x == None:\n        return 0\n    return x\n');
  fixDir(dir);
  assert.match(fs.readFileSync(f, 'utf8'), /if x is None:/);
});

test('--only restricts fixes to the listed rule; --except excludes one', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'a.js'), 'console.log("x");\n// Step 1: y\nexport const z = 1;\n');
  let result = scan([dir], { ignoreBase: dir });
  const onlyIds = planFixes(result, { only: ['069'] }).flatMap((p) => p.edits.map((e) => e.id));
  assert.deepStrictEqual([...new Set(onlyIds)], ['069'], 'only 069 planned');

  result = scan([dir], { ignoreBase: dir });
  const exceptIds = planFixes(result, { except: ['069'] }).flatMap((p) => p.edits.map((e) => e.id));
  assert.ok(exceptIds.includes('052') && !exceptIds.includes('069'), 'except drops 069, keeps 052');
});

test('fixing is idempotent — a second pass finds nothing', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'a.js'), 'console.log("x");\nexport const z = 1;\n');
  fixDir(dir);
  const second = planFixes(scan([dir], { ignoreBase: dir }), {});
  assert.strictEqual(second.length, 0, 'nothing left to fix');
});

test('every fixable id is a real detector; the default set is exactly the auto rules', () => {
  const rules = require('../src/rules');
  const { fixableIds, autoFixableIds, optInFixableIds } = require('../src/fix');
  const byId = {};
  for (const r of rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES)) byId[r.id] = r;
  for (const id of fixableIds()) assert.ok(byId[id], `fixer ${id} maps to a real rule`);
  // A plain `slopscore fix` may only touch behavior-preserving AUTO rules.
  for (const id of autoFixableIds()) assert.strictEqual(byId[id].authority, 'auto', `${id} default-fixable so must be auto`);
  // Opt-in fixers are the propose/flag ones, applied only with --only.
  for (const id of optInFixableIds()) assert.notStrictEqual(byId[id].authority, 'auto', `${id} is opt-in so must not be auto`);
});

test('a plain fix run skips an opt-in (propose) fixer; --only applies it', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'a.py'), 'value = compute()\nif value == True:\n    run()\n');
  // default run: 179 is propose, so nothing is fixed
  applyPlan(planFixes(scan([dir], { ignoreBase: dir }), {}));
  assert.match(fs.readFileSync(path.join(dir, 'a.py'), 'utf8'), /== True/, 'default run leaves the comparison');
  // explicit opt-in strips it
  applyPlan(planFixes(scan([dir], { ignoreBase: dir }), { only: ['179'] }));
  assert.ok(!fs.readFileSync(path.join(dir, 'a.py'), 'utf8').includes('== True'), '--only 179 strips it');
});

test('applying the fixes drives those findings out of the next scan', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'a.js'), 'console.log("a");\nconsole.log("b");\nexport const z = 1;\n');
  const before = scan([dir], { ignoreBase: dir }).findings.filter((f) => f.id === '052').length;
  assert.strictEqual(before, 2);
  fixDir(dir);
  const after = scan([dir], { ignoreBase: dir }).findings.filter((f) => f.id === '052').length;
  assert.strictEqual(after, 0, 'both console.logs gone');
});

test('the removal guard refuses to orphan a braceless control body', () => {
  const dir = tmpDir();
  const src = 'function f(x) {\n  if (x)\n    console.log(x);\n  return x;\n}\n';
  fs.writeFileSync(path.join(dir, 'a.js'), src);
  fixDir(dir);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'a.js'), 'utf8'), src, 'a braceless-if body is never deleted');
});

test('152/179 fixers never rewrite a comparison that lives inside a string', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'a.py'), 'MSG = "x == None is invalid"\nif y == None:\n    pass\n');
  applyPlan(planFixes(scan([dir], { ignoreBase: dir }), {})); // 152 is auto
  const out = fs.readFileSync(path.join(dir, 'a.py'), 'utf8');
  assert.match(out, /"x == None is invalid"/, 'string literal is untouched');
  assert.match(out, /if y is None:/, 'real code is fixed');
});
