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

test('282 is AST-only (off by default) and registered as security', { skip: SKIP }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-taint2-'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'function h(req){ const c = req.body.cmd; exec(c); }\n');
  assert.ok(!scan([dir], { ignoreBase: dir }).findings.some((f) => f.id === '282'), 'no 282 without --ast');
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  assert.strictEqual(all.find((r) => r.id === '282').category, 'security');
});
