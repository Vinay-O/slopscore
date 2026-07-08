'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-ui-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('227/228 flag shouting CTAs and superlatives', () => {
  assert.ok(ids(tmpFile('a.tsx', 'const B = () => <button>BUY NOW</button>;\n')).includes('227'));
  assert.ok(ids(tmpFile('b.tsx', 'const H = () => <h1>The world-class platform</h1>;\n')).includes('228'));
});

test('229 flags <html> without lang, not with', () => {
  assert.ok(ids(tmpFile('a.html', '<html>\n<body></body>\n</html>\n')).includes('229'));
  assert.ok(!ids(tmpFile('b.html', '<html lang="en">\n</html>\n')).includes('229'), 'lang present is fine');
});

test('230 flags a positive tabIndex', () => {
  assert.ok(ids(tmpFile('a.tsx', 'const D = () => <div tabIndex={3}>x</div>;\n')).includes('230'));
  assert.ok(!ids(tmpFile('b.tsx', 'const D = () => <div tabIndex={0}>x</div>;\n')).includes('230'), '0 is fine');
});

test('231 flags a viewport that disables zoom', () => {
  assert.ok(ids(tmpFile('a.html', '<meta name="viewport" content="width=device-width, user-scalable=no">\n')).includes('231'));
});

test('232/233 flag tiny fonts and 100vw', () => {
  assert.ok(ids(tmpFile('a.css', '.small { font-size: 9px; }\n')).includes('232'));
  assert.ok(!ids(tmpFile('b.css', '.ok { font-size: 16px; }\n')).includes('232'), '16px is fine');
  assert.ok(ids(tmpFile('c.css', '.hero { width: 100vw; }\n')).includes('233'));
});

test('234 flags !important', () => {
  assert.ok(ids(tmpFile('a.css', '.x { color: red !important; }\n')).includes('234'));
});

test('mobile detectors carry the mobile category', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const id of ['232', '233']) assert.strictEqual(all.find((r) => r.id === id).category, 'mobile');
});
