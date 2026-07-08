'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

// Writes named files into a fresh dir and returns the dir (so path-targeted
// rules — Dockerfile, .github/workflows — see a realistic layout).
function tmpProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-iac-'));
  for (const [rel, contents] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, contents);
  }
  return dir;
}
const idsIn = (dir) => scan([dir], { ignoreBase: dir }).findings.map((f) => f.id);

test('199 flags an unpinned Docker base image, not a pinned one', () => {
  assert.ok(idsIn(tmpProject({ Dockerfile: 'FROM node:latest\nRUN echo hi\n' })).includes('199'), ':latest');
  assert.ok(idsIn(tmpProject({ Dockerfile: 'FROM ubuntu\n' })).includes('199'), 'no tag');
  assert.ok(!idsIn(tmpProject({ Dockerfile: 'FROM node:20.11.1-alpine\n' })).includes('199'), 'pinned tag is fine');
  assert.ok(!idsIn(tmpProject({ Dockerfile: 'FROM scratch\n' })).includes('199'), 'scratch is fine');
});

test('200/201/202 flag Docker root, remote-exec, and baked secrets', () => {
  assert.ok(idsIn(tmpProject({ Dockerfile: 'FROM x:1\nUSER root\n' })).includes('200'));
  assert.ok(idsIn(tmpProject({ Dockerfile: 'FROM x:1\nRUN curl https://get.example.sh | sh\n' })).includes('201'));
  assert.ok(idsIn(tmpProject({ Dockerfile: 'FROM x:1\nENV API_KEY=abcd1234\n' })).includes('202'));
  assert.ok(!idsIn(tmpProject({ Dockerfile: 'FROM x:1\n# USER root is avoided here\nUSER app\n' })).includes('200'), 'comment is not a directive');
});

test('203 flags an insecure compose setting', () => {
  assert.ok(idsIn(tmpProject({ 'docker-compose.yml': 'services:\n  app:\n    privileged: true\n' })).includes('203'));
});

test('204/205/206 flag workflow footguns', () => {
  assert.ok(idsIn(tmpProject({ '.github/workflows/ci.yml': 'on: pull_request_target\n' })).includes('204'));
  assert.ok(idsIn(tmpProject({ '.github/workflows/ci.yml': 'steps:\n  - uses: actions/checkout@main\n' })).includes('205'));
  assert.ok(!idsIn(tmpProject({ '.github/workflows/ci.yml': 'steps:\n  - uses: actions/checkout@v4\n' })).includes('205'), 'a version tag is accepted');
  assert.ok(idsIn(tmpProject({ '.github/workflows/ci.yml': 'steps:\n  - run: echo ${{ github.event.pull_request.title }}\n' })).includes('206'));
});

test('config rules do not fire on ordinary source or yaml', () => {
  const dir = tmpProject({ 'app.js': 'const from = "node:latest";\nconst u = "USER root";\n', 'config.yml': 'privileged: true\n' });
  const got = idsIn(dir);
  assert.ok(!got.includes('199') && !got.includes('200'), 'Dockerfile rules are path-scoped');
  assert.ok(!got.includes('203'), 'compose rules do not fire on an arbitrary config.yml');
});
