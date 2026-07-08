'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-fake-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('211 flags a hardcoded dashboard stat', () => {
  assert.ok(ids(tmpFile('a.tsx', 'const stats = { users: 12847, revenue: 48200 };\n')).includes('211'));
  assert.ok(!ids(tmpFile('b.ts', 'const cfg = { retries: 3, timeout: 30 };\n')).includes('211'), 'small config numbers are fine');
});

test('212 flags mock data on a production path', () => {
  assert.ok(ids(tmpFile('a.ts', 'export const mockUsers = [{ id: 1 }];\n')).includes('212'));
  assert.ok(ids(tmpFile('b.ts', 'const dummyData = buildRows();\n')).includes('212'));
});

test('213 flags a metric driven by Math.random', () => {
  assert.ok(ids(tmpFile('a.tsx', 'const revenue = Math.random() * 1000;\n')).includes('213'));
  assert.ok(!ids(tmpFile('b.ts', 'const jitter = Math.random() * 100;\n')).includes('213'), 'non-metric randomness is fine');
});

test('214 flags an empty event handler', () => {
  assert.ok(ids(tmpFile('a.tsx', 'const B = () => <button onClick={() => {}}>Go</button>;\n')).includes('214'));
  assert.ok(!ids(tmpFile('b.tsx', 'const B = () => <button onClick={() => save()}>Go</button>;\n')).includes('214'), 'a real handler is fine');
});

test('215 flags a stub returning a canned success', () => {
  assert.ok(ids(tmpFile('a.ts', 'function save() {\n  return { ok: true };\n}\n')).includes('215'));
});

test('216 flags coming-soon copy in markup', () => {
  assert.ok(ids(tmpFile('a.tsx', 'const S = () => <span>Coming soon</span>;\n')).includes('216'));
});

test('217 flags fake sample identities', () => {
  assert.ok(ids(tmpFile('a.tsx', 'const email = "john@example.com";\n')).includes('217'));
  assert.ok(ids(tmpFile('b.tsx', 'const name = "Jane Doe";\n')).includes('217'));
});

test('fake detectors carry the fake category', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const id of ['211', '212', '213', '214', '215']) assert.strictEqual(all.find((r) => r.id === id).category, 'fake');
});
