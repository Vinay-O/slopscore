'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { commentMask } = require('../src/mask');
const report = require('../src/report');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-eng-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

test('customRules: a user-defined detector fires', () => {
  const f = tmpFile('a.js', 'const x = bannedApi();\n');
  const findings = scan([path.dirname(f)], {
    ignoreBase: path.dirname(f),
    customRules: [{ id: '901', pattern: 'bannedApi\\(', title: 'Banned API', severity: 'major', fix: 'Do not use bannedApi.' }],
  }).findings;
  const hit = findings.find((x) => x.id === '901');
  assert.ok(hit, 'custom rule 901 fired');
  assert.strictEqual(hit.severity, 'major');
  assert.strictEqual(hit.title, 'Banned API');
});

test('customRules: an invalid regex is skipped, not crashing', () => {
  const f = tmpFile('a.js', 'const x = 1;\n');
  assert.doesNotThrow(() => scan([path.dirname(f)], {
    ignoreBase: path.dirname(f),
    customRules: [{ id: '902', pattern: '(unclosed', fix: 'x' }],
  }));
});

test('multi-line template literals are masked as string (no false code matches)', () => {
  // `eval(` appears inside a multi-line template — must NOT be read as real code.
  const f = tmpFile('a.js', 'const t = `\n  run eval(x) here\n`;\nconst y = 1;\n');
  assert.ok(!scan(f).findings.some((x) => x.id === '172'), 'eval inside a multi-line template is masked');
  const m = commentMask(['const t = `', 'eval(x)', '`;'], '.js');
  assert.strictEqual(m[1][0], 2, 'the middle template line is string-classified');
});

test('junitReport emits valid-looking JUnit XML', () => {
  const f = tmpFile('a.js', 'const k = "AKIA1234567890ABCDEF";\n');
  const result = scan(f);
  const s = require('../src/score').score(result);
  const buf = [];
  report.captureTo(buf);
  report.junitReport(result, s);
  report.captureTo(null);
  const xml = buf.join('');
  assert.match(xml, /<\?xml version="1.0"/);
  assert.match(xml, /<testsuites name="slopscore"/);
  assert.match(xml, /<testcase/);
});
