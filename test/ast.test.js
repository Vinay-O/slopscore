'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { astAvailable, tsAvailable } = require('../src/ast');

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

test('TypeScript is analyzed when a TS parser is present, else skipped cleanly', { skip: SKIP }, () => {
  const ts = 'function f(a:number,b:number,c:number,d:number,e:number,g:number):number{ if(a){if(b){if(c){if(d){if(e){return g;}}}}} for(let i=0;i<a;i++){while(b){if(c&&d||e){break;}}} return a&&b||c&&d||e?1:2; }\n';
  const ids = scanSrc('a.ts', ts, { ast: true });
  if (tsAvailable()) assert.ok(ids.includes('279'), 'TS complexity flagged with @babel/parser');
  // either way, no crash
});

test('JSX / TSX parse without crashing', { skip: SKIP }, () => {
  assert.doesNotThrow(() => scanSrc('v.tsx', 'export const V = (p: {n: number}) => <div>{p.n > 0 ? <b>{p.n}</b> : null}</div>;\n', { ast: true }));
  assert.doesNotThrow(() => scanSrc('v.jsx', 'export const V = ({n}) => <div>{n}</div>;\n', { ast: true }));
});

test('AST analysis never crashes the scan on pathologically deep code', { skip: SKIP }, () => {
  let s = 'function f(){';
  for (let i = 0; i < 20000; i += 1) s += 'if(x){';
  s += 'y();';
  for (let i = 0; i < 20000; i += 1) s += '}';
  s += '}';
  assert.doesNotThrow(() => scanSrc('deep.js', s, { ast: true }), 'deep nesting must degrade gracefully, not crash');
});

test('286 detects cross-file structural clones (renamed copy-paste), not unique/small fns', { skip: SKIP }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-clone-'));
  const body = (n, k) => `function ${n}(items){ const out=[]; for(let i=0;i<items.length;i++){ const it=items[i]; if(it&&it.active){ if(it.score>${k}){out.push(it.id);}else{out.push(0);} } } return out.filter(x=>x>${k}); }\n`;
  fs.writeFileSync(path.join(dir, 'a.js'), body('processItems', 1));
  fs.writeFileSync(path.join(dir, 'b.js'), body('handleThings', 99)); // renamed fn/vars/literals, same shape
  fs.writeFileSync(path.join(dir, 'uniq.js'), 'export const dbl = (x) => x * 2;\n');
  const findings = scan([dir], { ignoreBase: dir, ast: true }).findings.filter((f) => f.id === '286');
  assert.ok(findings.length >= 2, 'both clone sites flagged');
  const files = new Set(findings.map((f) => f.file));
  assert.ok(files.has('a.js') && files.has('b.js'), 'both files');
  assert.ok(!findings.some((f) => f.file === 'uniq.js'), 'the unique small fn is not a clone');
  // off by default
  assert.ok(!scan([dir], { ignoreBase: dir }).findings.some((f) => f.id === '286'), 'no clones without --ast');
});

test('AST detectors 278-281 are registered', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const id of ['278', '279', '280', '281']) assert.ok(all.find((r) => r.id === id), `${id} exists`);
});
