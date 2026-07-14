'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const BIN = path.resolve(__dirname, '..', 'bin', 'slopscore.js');

function tmpDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-dx-'));
  for (const [rel, contents] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, contents);
  }
  return dir;
}
const run = (args, cwd) => {
  const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status };
};

test('doctor reports detector count and config health', () => {
  const dir = tmpDir({ '.slopscore.json': '{"failOn":"major","ignore":["dist"]}', 'a.js': 'const x = 1;\n' });
  const r = run(['doctor', dir], dir);
  assert.match(r.out, /detectors:\s+\d+/);
  assert.match(r.out, /fail-on:\s+major/);
});

test('config-schema validation warns on an unknown key', () => {
  const dir = tmpDir({ '.slopscore.json': '{"failOnn":"major"}', 'a.js': 'const x=1;\n' });
  const r = run(['scan', dir], dir);
  assert.match(r.out, /unknown .slopscore.json key "failOnn"/);
});

test('an invalid --format exits 2 with a clear error (not a silent terminal fallback)', () => {
  const dir = tmpDir({ 'a.js': 'const x = 1;\n' });
  const r = run(['scan', dir, '--format', 'jso'], dir);
  assert.strictEqual(r.code, 2, 'a typo\'d format must fail loudly');
  assert.match(r.out, /invalid --format/);
  // valid + the md alias still work
  assert.strictEqual(run(['scan', dir, '--format', 'json'], dir).code, 0);
  assert.strictEqual(run(['scan', dir, '--format', 'md'], dir).code, 0);
});

test('--changed with no git repo errors cleanly', () => {
  const dir = tmpDir({ 'a.js': 'const x=1;\n' });
  const r = run(['scan', dir, '--changed'], dir);
  assert.strictEqual(r.code, 2);
  assert.match(r.out, /needs a git repository/);
});

test('--changed scans only changed files in a git repo', () => {
  const dir = tmpDir({ 'clean.js': 'export const ok = 1;\n' });
  const git = (args) => execFileSync('git', args, { cwd: dir });
  git(['init', '-q']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 't']);
  git(['add', '.']);
  git(['commit', '-qm', 'init']);
  // add a new file with a secret; only it should be scanned
  fs.writeFileSync(path.join(dir, 'leak.js'), 'const k = "AKIA1234567890ABCDEF";\n');
  const r = run(['scan', '--changed', '--format', 'agent'], dir);
  assert.match(r.out, /leak\.js/, 'the changed file is scanned');
  assert.doesNotMatch(r.out, /clean\.js/, 'the unchanged file is not');
});
