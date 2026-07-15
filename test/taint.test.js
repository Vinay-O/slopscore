'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { astAvailable } = require('../src/ast');

const SKIP = !astAvailable();

function astIds(name, src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-taint-'));
  fs.writeFileSync(path.join(dir, name), src);
  return [...new Set(scan([dir], { ignoreBase: dir, ast: true }).findings.map((f) => f.id))];
}
const flows = (name, src) => astIds(name, src).includes('282');

test('282 catches cross-variable taint into sinks (the flows regex misses)', { skip: SKIP }, () => {
  assert.ok(flows('a.js', 'function h(req){ const sql = req.query.sql; return db.query(sql); }\n'), 'SQL');
  assert.ok(flows('b.js', 'function h(req,res){ const u = req.query.next; res.redirect(u); }\n'), 'open redirect');
  assert.ok(flows('c.js', 'function h(req){ const cmd = req.body.cmd; exec(cmd); }\n'), 'command injection');
  assert.ok(flows('d.js', 'function h(req){ const f = req.params.file; return fs.readFile(f); }\n'), 'path traversal');
  assert.ok(flows('e.js', 'function h(req){ const html = req.body.html; el.innerHTML = html; }\n'), 'XSS');
});

test('282 follows transitive aliasing (x = src; y = x; sink(y))', { skip: SKIP }, () => {
  assert.ok(flows('a.js', 'function h(req){ const x = req.query.q; const y = x; exec(y); }\n'));
});

test('282 tracks other sources (process.argv/env, location, document.cookie)', { skip: SKIP }, () => {
  assert.ok(flows('a.js', 'function h(){ const p = process.argv[2]; return fs.readFile(p); }\n'), 'argv');
  assert.ok(flows('b.js', 'function h(){ const n = location.hash; el.innerHTML = n; }\n'), 'location');
});

test('282 does NOT fire on safe / non-cross-variable cases', { skip: SKIP }, () => {
  assert.ok(!flows('a.js', 'function h(req){ const id = req.query.id; return db.query("SELECT 1 WHERE x=$1", [id]); }\n'), 'parameterized query is safe');
  assert.ok(!flows('b.js', 'function h(){ const u = "/home"; res.redirect(u); }\n'), 'constant is safe');
  assert.ok(!flows('c.js', 'function h(req,res){ res.redirect(req.query.next); }\n'), 'inline req is owned by the regex rule, not double-reported');
  assert.ok(!flows('d.js', 'function h(req){ const x = req.query.q; logger.info(x); }\n'), 'logging is not a tracked sink');
});

test('282 flags prototype pollution — a tainted key in a dynamic assignment', { skip: SKIP }, () => {
  assert.ok(flows('a.js', 'function h(req){ const k = req.body.key; target[k] = 1; }\n'), 'obj[taintedKey] = …');
  assert.ok(!flows('b.js', 'function h(req){ const v = req.body.v; target["fixed"] = v; }\n'), 'a fixed key (tainted value) is not pollution');
});

test('287 inter-procedural: user input flowing through a helper into a sink', { skip: SKIP }, () => {
  const ip = (name, src) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-ip-'));
    fs.writeFileSync(path.join(dir, name), src);
    return [...new Set(scan([dir], { ignoreBase: dir, ast: true }).findings.map((f) => f.id))].includes('287');
  };
  assert.ok(ip('a.js', 'function run(sql){ db.query(sql); }\napp.get("/x",(req)=>{ run(req.query.q); });\n'), 'SQLi through helper');
  assert.ok(ip('b.js', 'function run(cmd){ exec(cmd); }\nfunction h(req){ const c=req.body.c; run(c); }\n'), 'cmd injection through helper via var');
  assert.ok(ip('c.js', 'const load=(f)=>{ return fs.readFile(f); };\nfunction h(req){ load(req.params.file); }\n'), 'arrow helper');
  assert.ok(!ip('d.js', 'function fmt(x){ return String(x).trim(); }\nfunction h(req){ fmt(req.query.q); }\n'), 'helper that does not sink its param');
  assert.ok(!ip('e.js', 'function run(sql){ db.query(sql); }\nfunction h(){ run("SELECT 1"); }\n'), 'sink-helper called with a constant');
});

test('return-value taint (B): a returning helper propagates, a non-returning one does not', { skip: SKIP }, () => {
  const t282 = (name, src) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-rv-'));
    fs.writeFileSync(path.join(dir, name), src);
    return scan([dir], { ignoreBase: dir, ast: true }).findings.some((f) => f.id === '282');
  };
  // Helper returns its (tainted) param -> the result is tainted -> sink fires.
  assert.ok(t282('a.js', 'function clean(input){ return input.trim(); }\nfunction h(req){ const v = clean(req.body.x); exec(v); }\n'), 'returning helper propagates');
  // Validator returns a literal, not the param -> result is NOT tainted (no FP).
  assert.ok(!t282('b.js', 'function check(x){ if (!x) throw new Error(); return true; }\nfunction h(req){ const ok = check(req.body.x); exec(ok); }\n'), 'non-returning validator does not propagate');
  // Unknown/external helper stays conservative (no recall loss).
  assert.ok(t282('c.js', 'function h(req){ const v = _.identity(req.body.x); exec(v); }\n'), 'external call stays conservative');
});

test('inter-procedural taint (C): resolves class + object methods', { skip: SKIP }, () => {
  const t287 = (name, src) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-mr-'));
    fs.writeFileSync(path.join(dir, name), src);
    return scan([dir], { ignoreBase: dir, ast: true }).findings.some((f) => f.id === '287');
  };
  assert.ok(t287('a.js', 'class S { run(sql){ db.query(sql); } handle(req){ this.run(req.query.q); } }\n'), 'class method via this.');
  assert.ok(t287('b.js', 'const svc = { go(cmd){ exec(cmd); } };\nfunction h(req){ svc.go(req.body.c); }\n'), 'object method via obj.');
  assert.ok(!t287('c.js', 'class S { fmt(x){ return String(x); } handle(req){ this.fmt(req.query.q); } }\n'), 'method that does not sink its param is safe');
});

test('282 is AST-only (off by default) and registered as security', { skip: SKIP }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-taint2-'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'function h(req){ const c = req.body.cmd; exec(c); }\n');
  assert.ok(!scan([dir], { ignoreBase: dir }).findings.some((f) => f.id === '282'), 'no 282 without --ast');
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  assert.strictEqual(all.find((r) => r.id === '282').category, 'security');
});
