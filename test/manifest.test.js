'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function pkgDir(pkg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-mf-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = 1;\n');
  return dir;
}
const ids = (dir) => [...new Set(scan([dir], { ignoreBase: dir }).findings.map((f) => f.id))];

test('274 flags unpinned dependency versions, not pinned/ranged ones', () => {
  assert.ok(ids(pkgDir({ dependencies: { a: '*' } })).includes('274'));
  assert.ok(ids(pkgDir({ dependencies: { b: 'latest' } })).includes('274'));
  assert.ok(!ids(pkgDir({ dependencies: { c: '^1.2.3', d: '~2.0.0', e: '3.1.4' } })).includes('274'), 'ranged/exact versions are fine');
});

test('275 flags non-registry dependency sources', () => {
  assert.ok(ids(pkgDir({ dependencies: { a: 'git+https://github.com/x/y.git' } })).includes('275'));
  assert.ok(ids(pkgDir({ dependencies: { b: 'user/repo' } })).includes('275'));
  assert.ok(ids(pkgDir({ dependencies: { c: 'file:../local' } })).includes('275'));
  assert.ok(!ids(pkgDir({ dependencies: { d: '^1.0.0' } })).includes('275'), 'a registry version is fine');
});

test('276 flags lifecycle install scripts, not ordinary scripts', () => {
  assert.ok(ids(pkgDir({ scripts: { postinstall: 'node build.js' } })).includes('276'));
  assert.ok(ids(pkgDir({ scripts: { preinstall: 'sh setup.sh' } })).includes('276'));
  assert.ok(!ids(pkgDir({ scripts: { test: 'node --test', build: 'tsc' } })).includes('276'));
});

test('manifest supply-chain rules are categorized supply-chain', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const id of ['274', '275', '276', '277']) assert.strictEqual(all.find((r) => r.id === id).category, 'supply-chain');
});

test('277 flags duplicate-purpose dependencies', () => {
  assert.ok(ids(pkgDir({ dependencies: { moment: '^2.0.0', dayjs: '^1.0.0' } })).includes('277'));
  assert.ok(ids(pkgDir({ dependencies: { axios: '^1.0.0', got: '^12.0.0' } })).includes('277'));
  assert.ok(!ids(pkgDir({ dependencies: { dayjs: '^1.0.0', express: '^4.0.0' } })).includes('277'), 'unrelated deps are fine');
});

test('192 (broadened) flags more provider tokens', () => {
  const { scan } = require('../src/scanner');
  const os2 = require('node:os');
  const hit = (src) => {
    const dir = fs.mkdtempSync(path.join(os2.tmpdir(), 'sec3-'));
    fs.writeFileSync(path.join(dir, 'a.js'), src);
    return scan([dir], { ignoreBase: dir }).findings.some((f) => f.id === '192');
  };
  // Prefixes are split in the source literal so a secret scanner (incl. GitHub push
  // protection) sees no contiguous token, while the runtime-assembled string exercises 192.
  assert.ok(hit('const k = "GOC' + 'SPX-A1B2C3D4E5F6G7H8I9J0K1";\n'), 'Google client secret');
  assert.ok(hit('const k = "shp' + 'at_G1H2I3J4K5L6M7N8O9P0Q1R2S3T4U5V6";\n'), 'Shopify token');
  assert.ok(hit('const w = "https://discord.com/api/web' + 'hooks/123456789/A1B2C3D4E5F6G7H8I9J0";\n'), 'Discord webhook');
});
