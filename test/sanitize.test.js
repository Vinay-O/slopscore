'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { sanitizeSnippet } = require('../src/sanitize');
const { scan } = require('../src/scanner');

test('sanitizeSnippet strips a CSI clear-screen escape', () => {
  const out = sanitizeSnippet('abc\x1b[2Jdef');
  assert.strictEqual(out, 'abcdef');
  assert.ok(!out.includes('\x1b'));
});

test('sanitizeSnippet strips OSC sequences, cursor moves, and stray control chars', () => {
  assert.strictEqual(sanitizeSnippet('\x1b]0;pwned\x07x'), 'x', 'OSC title-set removed');
  assert.strictEqual(sanitizeSnippet('a\x1b[1;31mb\x1b[0mc'), 'abc', 'color codes removed');
  assert.strictEqual(sanitizeSnippet('a\rb\x00c\x7fd'), 'abcd', 'CR/NUL/DEL removed');
});

test('sanitizeSnippet leaves ordinary code (and tabs) intact', () => {
  const s = 'const q = `SELECT * FROM users`;\tok';
  assert.strictEqual(sanitizeSnippet(s), s);
  assert.strictEqual(sanitizeSnippet(42), 42, 'non-strings pass through');
});

test('end-to-end: a scanned file\'s escape sequence never reaches a finding snippet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-esc-'));
  const p = path.join(dir, 'poc.js');
  // A line that trips rule 058 (secret) AND embeds a clear-screen escape.
  fs.writeFileSync(p, 'const password = "abc\x1b[2Jdef123456789";\n');
  const findings = scan(p).findings;
  assert.ok(findings.length > 0, 'the secret is still detected');
  for (const f of findings) {
    assert.ok(!f.snippet.includes('\x1b'), `snippet must not carry ESC: ${JSON.stringify(f.snippet)}`);
  }
});
