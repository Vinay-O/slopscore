'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-sec2-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('192 flags provider-prefixed credentials', () => {
  assert.ok(ids(tmpFile('a.js', 'const k = "AIzaSyA1234567890abcdefghijklmnopqrstuvw";\n')).includes('192'), 'GCP');
  assert.ok(ids(tmpFile('b.js', 'const k = "glpat-abcdefghij1234567890";\n')).includes('192'), 'GitLab');
  assert.ok(ids(tmpFile('c.js', 'const k = "github_pat_11ABCDEFG0abcdefghijkl";\n')).includes('192'), 'GitHub fine-grained PAT');
  assert.ok(ids(tmpFile('d.js', 'const k = "sk_live_abcdefghij1234567890";\n')).includes('192'), 'Stripe secret');
  assert.ok(ids(tmpFile('e.js', 'const k = "npm_abcdefghijklmnopqrstuvwxyz0123456789";\n')).includes('192'), 'npm');
  assert.ok(ids(tmpFile('f.js', 'const k = "hf_abcdefghijklmnopqrstuvwxyz01234567";\n')).includes('192'), 'HuggingFace');
});

test('192 does not flag a publishable Stripe key or an env reference', () => {
  assert.ok(!ids(tmpFile('a.js', 'const k = "pk_live_abcdefghij1234567890";\n')).includes('192'), 'publishable key is public');
  assert.ok(!ids(tmpFile('b.js', 'const k = process.env.STRIPE_SECRET;\n')).includes('192'), 'env reference is fine');
});

test('193 flags a hardcoded JWT but not a placeholder', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  assert.ok(ids(tmpFile('a.js', `const t = "${jwt}";\n`)).includes('193'));
  assert.ok(!ids(tmpFile('b.js', 'const t = "ey.some.jwt";\n')).includes('193'), 'short placeholder is not a real token');
});

test('194 flags credentials embedded in a URL but not DB strings or placeholders', () => {
  assert.ok(ids(tmpFile('a.js', 'const u = "https://admin:s3cretPass@api.example.com/x";\n')).includes('194'));
  assert.ok(!ids(tmpFile('b.js', 'const u = "https://user:pass@host/x";\n')).includes('194'), 'obvious placeholder');
  assert.ok(!ids(tmpFile('c.js', 'const u = "https://api.example.com/x";\n')).includes('194'), 'no creds');
});
