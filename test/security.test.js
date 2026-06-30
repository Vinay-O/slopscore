'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');
const { planFixes, applyPlan } = require('../src/fix');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-sec-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('163 flags disabled TLS verification across languages', () => {
  assert.ok(ids(tmpFile('a.js', 'const o = { rejectUnauthorized: false };\n')).includes('163'));
  assert.ok(ids(tmpFile('b.py', 'r = requests.get(url, verify=False)\n')).includes('163'));
  assert.ok(ids(tmpFile('c.go', 'cfg := &tls.Config{ InsecureSkipVerify: true }\n')).includes('163'));
});

test('164 flags md5/sha1 only with a security word on the line, not a checksum', () => {
  assert.ok(ids(tmpFile('a.js', "const h = createHash('md5').update(password).digest('hex');\n")).includes('164'));
  assert.ok(!ids(tmpFile('b.js', "const etag = createHash('sha1').update(body).digest('hex');\n")).includes('164'), 'a content checksum is fine');
});

test('165 flags Math.random used for a security value', () => {
  assert.ok(ids(tmpFile('a.js', "const token = 'r' + Math.random().toString(36);\n")).includes('165'));
  assert.ok(!ids(tmpFile('b.js', 'const jitter = Math.random() * 100;\n')).includes('165'), 'non-security randomness is fine');
});

test('166 flags a hardcoded private key', () => {
  assert.ok(ids(tmpFile('a.js', 'const k = "-----BEGIN RSA PRIVATE KEY-----";\n')).includes('166'));
});

test('167 flags insecure Python deserialization', () => {
  assert.ok(ids(tmpFile('a.py', 'data = pickle.loads(payload)\n')).includes('167'));
  assert.ok(ids(tmpFile('b.py', 'cfg = yaml.load(text)\n')).includes('167'));
  assert.ok(!ids(tmpFile('c.py', 'cfg = yaml.load(text, Loader=yaml.SafeLoader)\n')).includes('167'), 'SafeLoader is fine');
});

test('168 flags a wildcard CORS origin', () => {
  assert.ok(ids(tmpFile('a.js', "res.setHeader('Access-Control-Allow-Origin', '*');\n")).includes('168'));
});

test('169 flags target=_blank without rel=noopener, and fix adds it', () => {
  const f = tmpFile('a.jsx', 'export const L = () => <a href="https://x.com" target="_blank">x</a>;\n');
  assert.ok(scan(f).findings.some((x) => x.id === '169'));
  applyPlan(planFixes(scan([path.dirname(f)], { ignoreBase: path.dirname(f) }), { only: ['169'] }));
  const after = fs.readFileSync(f, 'utf8');
  assert.match(after, /rel="noopener noreferrer"/);
  assert.ok(!scan(f).findings.some((x) => x.id === '169'), 'fixed link is no longer flagged');
});

test('169 does not flag a link that already has rel=noopener', () => {
  assert.ok(!ids(tmpFile('a.jsx', 'export const L = () => <a target="_blank" rel="noopener noreferrer" href="/x">x</a>;\n')).includes('169'));
});

test('170 flags credentials embedded in a connection string', () => {
  assert.ok(ids(tmpFile('a.js', 'const url = "postgres://admin:secret@db.host:5432/app";\n')).includes('170'));
  assert.ok(!ids(tmpFile('b.js', 'const url = "postgres://db.host:5432/app";\n')).includes('170'), 'no inline creds is fine');
});

test('171 flags SQL concatenation but not plain-English string concat', () => {
  assert.ok(ids(tmpFile('a.js', 'const q = "SELECT id FROM users WHERE name = " + name;\n')).includes('171'));
  assert.ok(ids(tmpFile('b.js', 'const u = "UPDATE users SET name = " + n;\n')).includes('171'));
  assert.ok(!ids(tmpFile('c.js', 'const label = firstName + " and " + lastName;\n')).includes('171'), 'English "and" concat is not SQL');
  assert.ok(!ids(tmpFile('d.js', 'const msg = title + " WHERE applicable";\n')).includes('171'), 'prose WHERE is not SQL');
});

test('172 flags eval / new Function', () => {
  assert.ok(ids(tmpFile('a.js', 'const r = eval(userInput);\n')).includes('172'));
  assert.ok(ids(tmpFile('b.js', 'const f = new Function("a", "return a");\n')).includes('172'));
});

test('172 does NOT flag a method call named eval (model.eval(), this.eval())', () => {
  assert.ok(!ids(tmpFile('a.js', 'const acc = model.eval();\n')).includes('172'), 'model.eval() is a method, not global eval');
  assert.ok(!ids(tmpFile('b.js', 'const r = this.eval(node);\n')).includes('172'));
  assert.ok(!ids(tmpFile('c.js', 'const v = parser.evaluate(expr);\n')).includes('172'));
});

test('172/106 do NOT flag a function or method DEFINITION named eval/confirm', () => {
  assert.ok(!ids(tmpFile('a.js', 'const o = { eval(x) { return x; } };\n')).includes('172'), 'method shorthand named eval');
  assert.ok(!ids(tmpFile('b.js', 'function evalRule(){}\n')).includes('172'));
  assert.ok(!ids(tmpFile('c.js', 'export function confirm(opts) { return show(opts); }\n')).includes('106'), 'a custom confirm() wrapper');
  assert.ok(ids(tmpFile('d.js', 'const r = eval(userInput);\n')).includes('172'), 'a real eval call still fires');
  assert.ok(ids(tmpFile('e.js', 'const ok = confirm("sure?");\n')).includes('106'), 'a bare confirm() call still fires');
});

test('163 does NOT flag a generic verify=False parameter (only an HTTP-client bypass)', () => {
  assert.ok(!ids(tmpFile('a.py', 'def sync_records(data, verify=False):\n    return data\n')).includes('163'), 'a generic param is not a TLS bypass');
  assert.ok(ids(tmpFile('b.py', 'r = requests.get(url, verify=False)\n')).includes('163'), 'requests bypass still caught');
  assert.ok(ids(tmpFile('c.py', 'session.verify = False\n')).includes('163'), 'session.verify = False still caught');
});

test('173 flags cleartext HTTP calls but not localhost', () => {
  assert.ok(ids(tmpFile('a.js', "fetch('http://api.example.com/login');\n")).includes('173'));
  assert.ok(!ids(tmpFile('b.js', "fetch('http://localhost:3000/x');\n")).includes('173'), 'localhost dev is fine');
  assert.ok(!ids(tmpFile('c.js', "fetch('https://api.example.com/login');\n")).includes('173'), 'https is fine');
});

test('174 flags an unverified JWT', () => {
  assert.ok(ids(tmpFile('a.js', "jwt.verify(t, key, { algorithms: ['none'] });\n")).includes('174'));
  assert.ok(ids(tmpFile('b.py', 'claims = jwt.decode(t, verify=False)\n')).includes('174'));
});

test('142 exempts a date-pinned model id (the recommended practice)', () => {
  assert.ok(!ids(tmpFile('a.ts', "const m = 'claude-3-5-sonnet-20241022';\n")).includes('142'), 'YYYYMMDD-pinned id is fine');
  assert.ok(!ids(tmpFile('b.ts', "const m = 'gpt-4o-2024-08-06';\n")).includes('142'), 'YYYY-MM-DD-pinned id is fine');
  assert.ok(ids(tmpFile('c.ts', "const m = 'gpt-4o';\n")).includes('142'), 'a bare floating alias is flagged');
});

test('all 12 new security patterns are categorized security and tagged in the catalog', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const id of ['163', '164', '165', '166', '167', '168', '169', '170', '171', '172', '173', '174']) {
    const r = all.find((x) => x.id === id);
    assert.ok(r, `rule ${id} exists`);
    assert.strictEqual(r.category, 'security', `${id} is a security rule`);
  }
});
