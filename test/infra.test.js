'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { score } = require('../src/score');
const report = require('../src/report');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-infra-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

test('fuzz: random inputs never crash or hang the scanner', () => {
  const chars = 'abcdef(){}[]<>=!;:"\'`/\\*#-$0123456789.\n\t ';
  const exts = ['.js', '.ts', '.py', '.go', '.rb', '.sh', '.sql', '.css', '.java'];
  for (let i = 0; i < 300; i += 1) {
    let s = '';
    const len = Math.floor(Math.random() * 400);
    for (let j = 0; j < len; j += 1) s += chars[Math.floor(Math.random() * chars.length)];
    const ext = exts[i % exts.length];
    const f = tmpFile(`fuzz${i}${ext}`, s);
    assert.doesNotThrow(() => scan(f), `scan threw on fuzz input #${i}`);
  }
});

test('determinism: scanning the same input twice yields identical findings', () => {
  const src = 'const API_KEY = "sk-abcdef0123456789abcdef";\nvar x = 1;\nif (a == b) run();\n';
  const f = tmpFile('a.js', src);
  const a = scan(f).findings.map((x) => `${x.id}:${x.line}`).sort();
  const b = scan(f).findings.map((x) => `${x.id}:${x.line}`).sort();
  assert.deepStrictEqual(a, b);
});

test('performance budget: ~5k lines scans well under 3s', () => {
  const block = 'export function f(x) { return x + 1; }\nconst y = compute();\n';
  const f = tmpFile('big.js', block.repeat(2500)); // ~5000 lines
  const t0 = Date.now();
  scan(f);
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, `scan took ${ms}ms (budget 3000ms)`);
});

test('golden: every report format produces well-formed output', () => {
  const f = tmpFile('slop.js', 'const k = "AKIA1234567890ABCDEF";\neval(userInput);\n');
  const result = scan(f);
  const s = score(result);
  const cap = () => { const b = []; report.captureTo(b); return () => { report.captureTo(null); return b.join(''); }; };

  let end = cap(); report.jsonReport(result, s); const json = end();
  assert.doesNotThrow(() => JSON.parse(json), 'json report parses');

  end = cap(); report.sarifReport(result, s); const sarif = end();
  const sarifObj = JSON.parse(sarif);
  assert.strictEqual(sarifObj.version, '2.1.0');

  end = cap(); report.junitReport(result, s); const junit = end();
  assert.match(junit, /<testsuites name="slopscore"/);

  end = cap(); report.markdownReport(result, s); const md = end();
  assert.match(md, /Slop Report/);

  end = cap(); report.agentReport(result, s); const agent = end();
  assert.match(agent, /SLOP_SCORE weighted=/);
});

test('clean corpus: idiomatic clean code scores zero (no false positives)', () => {
  const clean = {
    'a.ts': 'export const add = (a: number, b: number): number => a + b;\n\nexport function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n',
    'b.js': 'const items = [1, 2, 3];\nconst doubled = items.map((n) => n * 2);\nexport { doubled };\n',
    'c.py': 'def add(a, b):\n    """Add two numbers."""\n    return a + b\n',
    'd.css': '.card {\n  color: var(--ink);\n  padding: 1rem;\n}\n',
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-clean-'));
  for (const [n, c] of Object.entries(clean)) fs.writeFileSync(path.join(dir, n), c);
  const prod = scan([dir], { ignoreBase: dir }).findings.filter((x) => x.zone !== 'test');
  assert.deepStrictEqual(prod.map((x) => `${x.file}:${x.id}`), [], 'clean code must produce no findings');
});
