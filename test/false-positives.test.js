'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const rules = require('../src/rules');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-fp-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);
const findingsOf = (p) => scan(p).findings.filter((f) => f.zone !== 'test');

test('058 does not flag a spaced dictionary phrase (real-repo demo-secret FP)', () => {
  // regression: express uses `secret: "keyboard cat"` as an example — not a secret.
  assert.ok(!ids(tmpFile('a.js', 'app.use(session({ secret: "keyboard cat" }));\n')).includes('058'));
  assert.ok(!ids(tmpFile('b.js', 'const s = { secret: "manny is cool" };\n')).includes('058'));
  // but a real high-entropy secret still fires
  assert.ok(ids(tmpFile('c.js', 'const API_KEY = "sk-proj-abc123def456ghi789";\n')).includes('058'));
  assert.ok(ids(tmpFile('d.js', 'const password = "hunter2hunter2xyz";\n')).includes('058'));
});

test('var (223) and loose == (224) are low-confidence (gate-able as legacy noise, not AI-slop)', () => {
  const all = rules.LINE_RULES;
  assert.strictEqual(all.find((r) => r.id === '223').confidence, 'low');
  assert.strictEqual(all.find((r) => r.id === '224').confidence, 'low');
});

test('idiomatic clean code in the new languages produces no findings', () => {
  const clean = {
    'A.java': 'import org.slf4j.Logger;\n\nclass Calc {\n  int add(int a, int b) { return a + b; }\n}\n',
    'B.cs': 'public class Calc {\n  public async Task<int> AddAsync(int a, int b) { return a + b; }\n}\n',
    'c.rb': 'def add(a, b)\n  a + b\nend\n',
    'd.php': "<?php\nfunction add($a, $b) {\n    return $a + $b;\n}\n",
    'e.sh': '#!/usr/bin/env bash\nset -euo pipefail\nrm -rf "${BUILD_DIR:?}"\n',
    'f.sql': 'DELETE FROM sessions WHERE expires_at < NOW();\nUPDATE users SET active = true WHERE id = 42;\n',
  };
  for (const [name, src] of Object.entries(clean)) {
    const got = findingsOf(tmpFile(name, src));
    assert.deepStrictEqual(got.map((f) => f.id), [], `${name} should be clean, got ${got.map((f) => f.id)}`);
  }
});

test('idiomatic clean code in the new categories (robustness/fake/mobile) produces no findings', () => {
  const clean = {
    'robust.js': 'const n = parseInt(raw, 10);\nconst m = str.match(/\\d+/);\nif (m) use(m[0]);\ntry { data = JSON.parse(await res.text()); } catch (e) { handle(e); }\n',
    'data.tsx': 'const stats = { retries: 3, timeoutMs: 30 };\nconst onSave = () => persist(form);\n',
    'styles.css': '.card {\n  width: 100%;\n  max-width: 40rem;\n  font-size: 1rem;\n}\n',
  };
  for (const [name, src] of Object.entries(clean)) {
    const got = findingsOf(tmpFile(name, src));
    assert.deepStrictEqual(got.map((f) => f.id), [], `${name} should be clean, got ${got.map((f) => f.id)}`);
  }
});
