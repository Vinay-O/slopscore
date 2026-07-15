'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { runCompare } = require('../src/compare');

function hasGit() {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
const SKIP = !hasGit();
// Faithful stand-in for bin's parseArgs, for the bits compare reads.
const noFlags2 = (argv) => ({
  paths: argv.filter((a) => !a.startsWith('-')),
  format: (argv.includes('--markdown') || argv.includes('--md')) ? 'markdown' : 'terminal',
  ast: argv.includes('--ast'),
});

function inRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-cmptest-'));
  const cwd = process.cwd();
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
    process.chdir(dir);
    return fn(dir);
  } finally {
    process.chdir(cwd);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

test('compare flags newly-introduced slop with a non-zero exit', { skip: SKIP }, () => {
  inRepo((dir) => {
    fs.writeFileSync(path.join(dir, 'app.js'), 'export function ok(a){ return a + 1; }\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: dir });
    // Introduce a hardcoded secret + SQLi in the working tree.
    fs.appendFileSync(path.join(dir, 'app.js'),
      'const API_KEY = "sk-proj-abc123def456ghi789jkl012mno345";\nconst q = `SELECT * FROM u WHERE id=${req.query.id}`;\n');
    const r = runCompare(['HEAD'], noFlags2);
    assert.equal(r.code, 1, 'introducing slop exits non-zero');
    const text = r.lines.join('\n');
    assert.match(text, /new finding/);
    assert.match(text, /\[058\]/, 'reports the new secret');
  });
});

test('compare reports a net improvement (fixed findings) with exit 0', { skip: SKIP }, () => {
  inRepo((dir) => {
    fs.writeFileSync(path.join(dir, 'app.js'), 'const API_KEY = "sk-proj-abc123def456ghi789jkl012mno345";\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'with-secret'], { cwd: dir });
    fs.writeFileSync(path.join(dir, 'app.js'), 'export const x = 1;\n'); // secret removed
    const r = runCompare(['HEAD'], noFlags2);
    assert.equal(r.code, 0, 'removing slop is not a failure');
    assert.match(r.lines.join('\n'), /finding fixed|Net improvement/);
  });
});

test('compare --markdown emits a PR-ready comment', { skip: SKIP }, () => {
  inRepo((dir) => {
    fs.writeFileSync(path.join(dir, 'app.js'), 'export const x = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: dir });
    fs.appendFileSync(path.join(dir, 'app.js'), 'const API_KEY = "sk-proj-abc123def456ghi789jkl012mno345";\n');
    const r = runCompare(['HEAD', '--markdown'], noFlags2);
    assert.equal(r.code, 1);
    const md = r.lines.join('\n');
    assert.match(md, /## 🩺 slopscore — PR delta/);
    assert.match(md, /Slop Score:/);
    assert.match(md, /\[058\]/);
    assert.match(md, /introduces slop/);
  });
});

test('compare errors cleanly on an invalid ref', { skip: SKIP }, () => {
  inRepo((dir) => {
    fs.writeFileSync(path.join(dir, 'a.js'), 'export const x = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: dir });
    const r = runCompare(['no-such-ref'], noFlags2);
    assert.equal(r.code, 2);
    assert.match(r.lines.join('\n'), /not a valid git ref/);
  });
});
