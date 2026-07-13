'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { astAvailable } = require('../src/ast');

const SKIP = !astAvailable(); // acorn (optional peer) not installed → skip AST tests

function scanSrc(name, src, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-ast-'));
  fs.writeFileSync(path.join(dir, name), src);
  return scan([dir], { ignoreBase: dir, ...opts }).findings.map((f) => f.id);
}

test('AST detectors are OFF by default (only with --ast/ast:true)', { skip: SKIP }, () => {
  const complex = 'function f(a,b,c,d,e,f){ if(a){if(b){if(c){if(d){if(e){return f;}}}}} return a&&b||c&&d?1:2; }\n';
  assert.ok(!scanSrc('a.js', complex).some((id) => ['278', '279', '280', '281'].includes(id)), 'no AST findings without opt-in');
});

test('279 high cyclomatic complexity (accurate, not a control-block miscount)', { skip: SKIP }, () => {
  const complex = 'function f(a,b,c,d,e,f){ if(a){if(b){if(c){if(d){if(e){return f;}}}}} for(let i=0;i<a;i++){while(b){if(c&&d||e){break;}}} return a&&b||c&&d||e?1:2; }\n';
  assert.ok(scanSrc('a.js', complex, { ast: true }).includes('279'));
});

test('280 deep nesting + 281 too many params', { skip: SKIP }, () => {
  const nested = 'function f(a,b,c,d,e,g){ if(a){ for(;;){ while(b){ try{ if(c){ h(); } }catch(e){} } } } }\n';
  const ids = scanSrc('a.js', nested, { ast: true });
  assert.ok(ids.includes('280'), 'deep nesting');
  assert.ok(ids.includes('281'), 'six params');
});

test('278 long function', { skip: SKIP }, () => {
  const body = Array.from({ length: 70 }, (_, i) => `  const v${i} = ${i} + 1;`).join('\n');
  assert.ok(scanSrc('a.js', `function big() {\n${body}\n  return 0;\n}\n`, { ast: true }).includes('278'));
});

test('a small, simple function yields no AST findings', { skip: SKIP }, () => {
  assert.ok(!scanSrc('a.js', 'const add = (a, b) => a + b;\n', { ast: true }).some((id) => ['278', '279', '280', '281'].includes(id)));
});

test('unparseable (TS/JSX) files are skipped, not crashed', { skip: SKIP }, () => {
  assert.doesNotThrow(() => scanSrc('a.ts', 'const x: number = 1;\ntype T = { a: string };\n', { ast: true }));
});

test('AST detectors 278-281 are registered', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const id of ['278', '279', '280', '281']) assert.ok(all.find((r) => r.id === id), `${id} exists`);
});
