'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BIN = path.join(__dirname, '..', 'bin', 'slopscore.js');

function initIn() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-init-'));
  execFileSync('node', [BIN, 'init'], { cwd: dir, encoding: 'utf8' });
  return dir;
}

test('init scaffolds config, CI workflow, and an agent directive', () => {
  const dir = initIn();
  assert.ok(fs.existsSync(path.join(dir, '.slopscore.json')));
  assert.ok(fs.existsSync(path.join(dir, '.github', 'workflows', 'anti-slop.yml')));
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.match(agents, /slopscore protocol/, 'tells the agent to load the catalog');
  assert.match(agents, /--fail-on major/, 'tells the agent to gate on a scan');
  assert.match(agents, /--format agent/, 'points the agent at agent mode');
  assert.match(agents, /<!-- slopscore:anti-slop -->/, 'carries the idempotency marker');
});

test('init is idempotent — re-running does not duplicate the agent section', () => {
  const dir = initIn();
  execFileSync('node', [BIN, 'init'], { cwd: dir, encoding: 'utf8' });
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  // the section is delimited by an open + close marker = 2 occurrences, no more
  assert.strictEqual((agents.match(/<!-- slopscore:anti-slop -->/g) || []).length, 2);
});

test('init appends to an existing AGENTS.md without clobbering it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-init2-'));
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Agent Instructions\n\nUse tabs.\n');
  execFileSync('node', [BIN, 'init'], { cwd: dir, encoding: 'utf8' });
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.match(agents, /Use tabs\./, 'preserves existing content');
  assert.match(agents, /Anti-Slop Protocol/, 'adds the slopscore section');
});
