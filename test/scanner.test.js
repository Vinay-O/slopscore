'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { execFileSync } = require('node:child_process');

const { scan } = require('../src/scanner');
const { score } = require('../src/score');
const { fingerprint, writeBaseline, loadBaseline } = require('../src/baseline');
const { sparkline, appendHistory, loadHistory, trendDelta } = require('../src/history');

const BIN = path.join(__dirname, '..', 'bin', 'slopscore.js');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

function ids(result) {
  return result.findings.map((f) => f.id);
}

test('detects console.log in real code', () => {
  const p = tmpFile('a.js', 'function f(){ console.log("x"); }\n');
  assert.ok(ids(scan(p)).includes('052'));
});

test('ignores console.log inside a comment', () => {
  const p = tmpFile('a.js', '// console.log("x") is fine in a comment\nconst y = 1;\n');
  assert.ok(!ids(scan(p)).includes('052'));
});

test('ignores console.log inside a block comment', () => {
  const p = tmpFile('a.js', '/*\n console.log("nope");\n*/\nconst y = 1;\n');
  assert.ok(!ids(scan(p)).includes('052'));
});

test('a // inside a string does not suppress detection later on the line', () => {
  // Pre-fix, the // in the URL was treated as a comment start, masking the rest
  // of the line and silently hiding the `: any`.
  const p = tmpFile('a.ts', 'const url = "http://x.com"; const k: any = 1;\n');
  assert.ok(ids(scan(p)).includes('054'));
});

test('078 flags Python bare except but not a JS object key named except', () => {
  assert.ok(ids(scan([tmpFile('a.py', 'try:\n    risky()\nexcept:\n    pass\n')])).includes('078'), 'real bare except');
  assert.ok(ids(scan([tmpFile('b.py', 'try:\n    x()\nexcept Exception as e:\n    pass\n')])).includes('078'), 'except Exception');
  assert.ok(!ids(scan([tmpFile('c.js', 'const o = { except: a, only: b };\n')])).includes('078'), 'JS object key is not a bare except');
});

test('detects empty catch block', () => {
  const p = tmpFile('a.js', 'try { go(); } catch (e) {}\n');
  assert.ok(ids(scan(p)).includes('053'));
});

test('detects TypeScript any but not in .d.ts', () => {
  const bad = tmpFile('a.ts', 'const x: any = 1;\n');
  assert.ok(ids(scan(bad)).includes('054'));
  const shim = tmpFile('a.d.ts', 'declare const x: any;\n');
  assert.ok(!ids(scan(shim)).includes('054'));
});

test('detects hardcoded secret but not an env read', () => {
  const bad = tmpFile('a.js', 'const apiKey = "abcdef『1234567890abcd";\n'.replace('『', ''));
  assert.ok(ids(scan(bad)).includes('058'));
  const ok = tmpFile('b.js', 'const apiKey = process.env.API_KEY;\n');
  assert.ok(!ids(scan(ok)).includes('058'));
});

test('detects SQL injection via template literal', () => {
  const p = tmpFile('a.js', 'const q = `SELECT * FROM users WHERE id = ${id}`;\n');
  assert.ok(ids(scan(p)).includes('072'));
});

test('detects auth token in localStorage', () => {
  const p = tmpFile('a.js', 'localStorage.setItem("token", jwt);\n');
  assert.ok(ids(scan(p)).includes('073'));
});

test('003 detects glassmorphism in CSS-in-JS (MUI camelCase), not just Tailwind', () => {
  assert.ok(ids(scan([tmpFile('a.tsx', 'export const C = () => <Box sx={{ backdropFilter: "blur(12px)" }} />;\n')])).includes('003'), 'MUI sx camelCase');
  assert.ok(ids(scan([tmpFile('b.ts', "export const panel = { WebkitBackdropFilter: 'blur(8px)' };\n")])).includes('003'), 'styled .ts camelCase');
  assert.ok(ids(scan([tmpFile('c.css', '.glass { backdrop-filter: blur(10px); }\n')])).includes('003'), 'plain CSS still works');
});

test('001 detects a purple gradient in CSS-in-JS / theme tokens, not just Tailwind hexes', () => {
  assert.ok(ids(scan([tmpFile('a.tsx', "export const H = () => <Box sx={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #6366f1 100%)' }} />;\n")])).includes('001'), 'MUI sx gradient with violet/indigo hexes');
  assert.ok(ids(scan([tmpFile('b.ts', "export const theme = { hero: { backgroundImage: 'linear-gradient(90deg, #a78bfa, #818cf8)' } };\n")])).includes('001'), 'theme.ts token gradient');
  assert.ok(!ids(scan([tmpFile('c.tsx', "export const Ok = () => <Box sx={{ background: 'linear-gradient(90deg, #0a0a0a, #1f2937)' }} />;\n")])).includes('001'), 'a neutral gradient is not flagged');
});

test('008 detects gradient text in CSS-in-JS camelCase', () => {
  assert.ok(ids(scan([tmpFile('a.tsx', "export const T = () => <span style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Hi</span>;\n")])).includes('008'), 'emotion/MUI camelCase');
});

test('detects img without alt', () => {
  const p = tmpFile('a.jsx', 'export const X = () => <img src="/h.png" />;\n');
  assert.ok(ids(scan(p)).includes('081'));
});

test('does not flag img that has alt', () => {
  const p = tmpFile('a.jsx', 'export const X = () => <img src="/h.png" alt="hero" />;\n');
  assert.ok(!ids(scan(p)).includes('081'));
});

test('detects div with onClick (no role=button)', () => {
  const p = tmpFile('a.jsx', 'export const X = () => <div onClick={go}>Go</div>;\n');
  assert.ok(ids(scan(p)).includes('082'));
});

test('flags a sprawling god file but not a large cohesive one', () => {
  // 500+ lines spread across many separate functions = sprawl
  let sprawl = '';
  for (let i = 0; i < 12; i += 1) sprawl += `function unit${i}() {\n${'  doThing();\n'.repeat(45)}}\n`;
  assert.ok(ids(scan(tmpFile('god.js', sprawl))).includes('055'));
  // 600 lines but one cohesive data structure (1 responsibility) = not a god file
  const data = `export const TABLE = {\n${Array.from({ length: 600 }, (_, i) => `  k${i}: ${i},`).join('\n')}\n};\n`;
  assert.ok(!ids(scan(tmpFile('data.js', data))).includes('055'));
});

test('071 ignores a constant innerHTML and an === comparison', () => {
  assert.ok(ids(scan(tmpFile('a.js', 'el.innerHTML = userInput;\n'))).includes('071'));
  assert.ok(!ids(scan(tmpFile('b.js', 'el.innerHTML = "<b>static</b>";\n'))).includes('071'));
  assert.ok(!ids(scan(tmpFile('c.js', 'if (el.innerHTML === expected) ok();\n'))).includes('071'));
});

test('skips test files for skipTests rules', () => {
  const p = tmpFile('a.test.js', 'console.log("debugging a test");\n');
  assert.ok(!ids(scan(p)).includes('052'));
});

test('score: clean input is pristine', () => {
  const p = tmpFile('a.js', 'export const add = (a, b) => a + b;\n');
  const s = score(scan(p));
  assert.strictEqual(s.weighted, 0);
  assert.match(s.verdict, /Pristine/);
});

test('score: critical weighs 10, major 3, minor 1', () => {
  const p = tmpFile('a.ts', [
    'localStorage.setItem("token", jwt);', // 073 critical (10)
    'const x: any = 1;',                    // 054 major (3)
    '// TODO: later',                        // 057 minor (1)
  ].join('\n') + '\n');
  const s = score(scan(p));
  assert.strictEqual(s.counts.critical, 1);
  assert.strictEqual(s.counts.major, 1);
  assert.strictEqual(s.counts.minor, 1);
  assert.strictEqual(s.weighted, 14);
});

test('binary files are skipped', () => {
  const p = tmpFile('a.js', 'const ok = 1;\u0000console.log("hidden");\n');
  assert.strictEqual(scan(p).findings.length, 0);
});

// ---- Expansion detectors (sub-project B): each has a positive case, and a
// negative where a false positive is plausible. ----

test('045 flags an exclamation-mark CTA', () => {
  const p = tmpFile('a.jsx', 'export const X = () => <button>Get Started Now!</button>;\n');
  assert.ok(ids(scan(p)).includes('045'));
});

test('060 flags a placeholder component name but not a real one', () => {
  const bad = tmpFile('a.tsx', 'export function TestComponent() { return null; }\n');
  assert.ok(ids(scan(bad)).includes('060'));
  const ok = tmpFile('b.tsx', 'export function InvoiceTable() { return null; }\n');
  assert.ok(!ids(scan(ok)).includes('060'));
});

test('076 flags placeholder config values', () => {
  const p = tmpFile('a.js', 'const cfg = { key: "YOUR_API_KEY" };\n');
  assert.ok(ids(scan(p)).includes('076'));
});

test('078 flags broad exceptions in Python and TS, not a narrow catch', () => {
  const py = tmpFile('a.py', 'try:\n    go()\nexcept Exception as e:\n    pass\n');
  assert.ok(ids(scan(py)).includes('078'));
  const ts = tmpFile('a.ts', 'try { go(); } catch (e: any) { log(e); }\n');
  assert.ok(ids(scan(ts)).includes('078'));
  const ok = tmpFile('b.ts', 'try { go(); } catch (e: unknown) { log(e); }\n');
  assert.ok(!ids(scan(ok)).includes('078'));
});

test('093 flags a whole-lodash import', () => {
  const p = tmpFile('a.js', 'import _ from "lodash";\nconst y = _.throttle(f, 200);\n');
  assert.ok(ids(scan(p)).includes('093'));
  const ok = tmpFile('b.js', 'import throttle from "lodash/throttle";\n');
  assert.ok(!ids(scan(ok)).includes('093'));
});

test('116 flags an error returned as HTTP 200', () => {
  const p = tmpFile('a.js', 'res.status(200).json({ error: "nope" });\n');
  assert.ok(ids(scan(p)).includes('116'));
});

test('132 flags a credential in a URL, not a plain path or an opaque token link', () => {
  const bad = tmpFile('a.js', 'const u = "https://api.x.com/v1?api_key=abc123";\n');
  assert.ok(ids(scan(bad)).includes('132'));
  const page = tmpFile('b.js', 'const u = "https://api.x.com/v1?page=2";\n');
  assert.ok(!ids(scan(page)).includes('132'));
  // RFC 8058 one-click unsubscribe / email-verify links use ?token= legitimately.
  const unsub = tmpFile('c.js', 'const u = `${base}/unsubscribe?token=${t}`;\n');
  assert.ok(!ids(scan(unsub)).includes('132'));
});

// False-positive guards found by adversarial review.
test('072 flags real SQL templates, not English copy containing SQL words', () => {
  const sql = tmpFile('a.js', 'const q = `SELECT * FROM users WHERE id = ${id}`;\n');
  assert.ok(ids(scan(sql)).includes('072'));
  const copy = tmpFile('b.tsx', 'const msg = `Last update: ${t}`;\nconst d = `Delete the project "${n}"?`;\n');
  assert.ok(!ids(scan(copy)).includes('072'));
});

test('083 flags outline:none only when the file has no focus-visible style', () => {
  const bad = tmpFile('a.css', '.btn { outline: none; }\n');
  assert.ok(ids(scan(bad)).includes('083'));
  const ok = tmpFile('b.css', '.btn { outline: none; }\n.btn:focus-visible { outline: 2px solid blue; }\n');
  assert.ok(!ids(scan(ok)).includes('083'));
});

test('116 skips the { error: null } success envelope', () => {
  const bad = tmpFile('a.js', 'res.status(200).json({ error: "boom" });\n');
  assert.ok(ids(scan(bad)).includes('116'));
  const ok = tmpFile('b.js', 'res.status(200).json({ success: true, error: null });\n');
  assert.ok(!ids(scan(ok)).includes('116'));
});

test('054 does not also fire on a catch (e: any) line (078 owns it)', () => {
  const p = tmpFile('a.ts', 'try { go(); } catch (e: any) { log(e); }\n');
  const got = ids(scan(p));
  assert.ok(got.includes('078'));
  assert.ok(!got.includes('054'));
});

test('099 skips a localhost env-var fallback', () => {
  const ok = tmpFile('a.js', "const base = process.env.API_BASE ?? 'http://localhost:3000';\n");
  assert.ok(!ids(scan(ok)).includes('099'));
  const bad = tmpFile('b.js', "const base = 'http://localhost:3000';\n");
  assert.ok(ids(scan(bad)).includes('099'));
});

test('143 flags production source maps', () => {
  const p = tmpFile('next.config.js', 'module.exports = { productionBrowserSourceMaps: true };\n');
  assert.ok(ids(scan(p)).includes('143'));
});

test('144 flags command injection via interpolated shell', () => {
  const bad = tmpFile('a.js', 'execSync(`rm -rf ${userInput}`);\n');
  assert.ok(ids(scan(bad)).includes('144'));
  const ok = tmpFile('b.js', 'execSync("git status");\n');
  assert.ok(!ids(scan(ok)).includes('144'));
});

test('149 flags a tautological test assertion', () => {
  const p = tmpFile('a.js', 'it("works", () => { expect(true).toBe(true); });\n');
  assert.ok(ids(scan(p)).includes('149'));
});

test('058 flags an AWS key and a private-key header', () => {
  const aws = tmpFile('a.js', 'const k = "AKIAIOSFODNN7EXAMPLE";\n'.replace('EXAMPLE', 'QQQQRRRR'));
  assert.ok(ids(scan(aws)).includes('058'));
  const pem = tmpFile('b.js', 'const k = "-----BEGIN RSA PRIVATE KEY-----";\n');
  assert.ok(ids(scan(pem)).includes('058'));
});

test('106 flags a browser prompt() but not an LLM prompt() function', () => {
  const dlg = tmpFile('a.js', 'const name = prompt("Enter your name");\n');
  assert.ok(ids(scan(dlg)).includes('106'));
  const llm = tmpFile('b.js', 'const reply = await prompt(systemMessage);\n');
  assert.ok(!ids(scan(llm)).includes('106'));
});

// Security: committed-.env detection must work WITHOUT executing git (running
// git in an untrusted scan dir is an RCE vector via .git/config).
test('107 flags a committed .env without shelling out to git', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-env-'));
  fs.writeFileSync(path.join(dir, '.env'), 'SECRET=abc123\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  assert.ok(ids(scan([dir], { ignoreBase: dir })).includes('107'));
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n'); // dev's local, gitignored
  assert.ok(!ids(scan([dir], { ignoreBase: dir })).includes('107'));
});

// Regression for the O(n²) line-number DoS: whole-file matches must report
// correct line numbers (and complete fast) even when matches are dense.
test('whole-file rule reports correct line numbers for many matches', () => {
  const p = tmpFile('a.js', 'a();\ntry{}catch(e){}\nb();\ntry{}catch(e){}\n');
  const hits = scan(p).findings.filter((f) => f.id === '053');
  assert.strictEqual(hits.length, 2);
  assert.deepStrictEqual(hits.map((f) => f.line).sort((a, b) => a - b), [2, 4]);
});

test('history records runs and reports the trend delta', () => {
  assert.strictEqual(sparkline([]), '');
  assert.strictEqual(sparkline([0, 5, 10]).length, 3);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-hist-'));
  const file = path.join(dir, 'h.json');
  appendHistory(file, { weighted: 10 });
  const runs = appendHistory(file, { weighted: 5 });
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(loadHistory(file).length, 2);
  assert.match(trendDelta([{ weighted: 10 }], 5), /down 50%/);
});

// Baseline / ratchet mode: snapshot accepted findings, fail only on NEW slop.
test('baseline fingerprint ignores line number but tracks content', () => {
  const f = { id: '054', file: 'src/x.ts', line: 5, snippet: 'const a: any = 1;' };
  assert.strictEqual(fingerprint(f), fingerprint({ ...f, line: 99 }), 'moving code is not new slop');
  assert.notStrictEqual(fingerprint(f), fingerprint({ ...f, snippet: 'const a: any = 2;' }), 'changed code is new');
});

test('baseline write/load roundtrips and separates new from known', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-bl-'));
  const file = path.join(dir, 'b.json');
  const known = { id: '054', file: 'a.ts', line: 1, snippet: 'const a: any = 1;' };
  assert.strictEqual(writeBaseline(file, [known], ''), 1);
  const set = loadBaseline(file);
  assert.ok(set.has(fingerprint(known)), 'baselined finding is known');
  assert.ok(!set.has(fingerprint({ id: '054', file: 'a.ts', line: 9, snippet: 'const b: any = 2;' })), 'a different finding is new');
  assert.strictEqual(loadBaseline(path.join(dir, 'missing.json')), null, 'missing baseline -> null');
});

test('083 respects a global :focus-visible reset in another file (cross-file)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-fv-'));
  fs.writeFileSync(path.join(dir, 'button.css'), '.btn { outline: none; }\n');
  fs.writeFileSync(path.join(dir, 'global.css'), '*:focus-visible { outline: 2px solid blue; }\n');
  assert.ok(!ids(scan([dir], { ignoreBase: dir })).includes('083'),
    'a global focus-visible reset should suppress outline:none repo-wide');
  fs.unlinkSync(path.join(dir, 'global.css'));
  assert.ok(ids(scan([dir], { ignoreBase: dir })).includes('083'),
    'without the global reset, outline:none should flag again');
});

// Context weighting: generated/minified files are skipped, and test/tooling
// findings are zoned non-production so the headline score reflects shipped risk.
test('minified / generated files are skipped entirely', () => {
  const byName = tmpFile('lib.min.js', 'try{}catch(e){}\nconst x = 1;\n');
  assert.strictEqual(scan(byName).findings.length, 0);
  const byHugeLine = tmpFile('huge.js', `try{}catch(e){}\n${'a'.repeat(4000)}\n`);
  assert.strictEqual(scan(byHugeLine).findings.length, 0);
});

test('test/tooling findings are non-production and excluded from the headline score', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-zone-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'test'));
  fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'const x: any = 1;\n');  // production major
  fs.writeFileSync(path.join(dir, 'test', 'a.ts'), 'const y: any = 1;\n'); // non-production
  const s = score(scan([dir], { ignoreBase: dir }));
  assert.strictEqual(s.counts.major, 1, 'only the production any is scored');
  assert.strictEqual(s.nonprod.total, 1, 'the test any is reported, not scored');
});

test('136 flags a hollow loading state (returns null) but not a real spinner', () => {
  const bad = tmpFile('a.tsx', 'function C(){ if (loading) return null; return <div/>; }\n');
  assert.ok(ids(scan(bad)).includes('136'));
  const ok = tmpFile('b.tsx', 'function C(){ if (loading) return <Spinner/>; }\n');
  assert.ok(!ids(scan(ok)).includes('136'));
});

test('142 catches current aliased model ids', () => {
  const p = tmpFile('a.ts', 'const m = "claude-sonnet-4";\nconst n = "gpt-4.1";\n');
  assert.ok(ids(scan(p)).includes('142'));
});

test('068 scores repeated markup as minor but logic duplication as major', () => {
  const logic = 'function totals(items, rate) {\n  let sub = 0;\n  for (const it of items) {\n    sub += it.price * it.qty;\n  }\n  const tax = sub * rate;\n  return { sub, tax, total: sub + tax };\n}\n';
  const ld = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-ld-'));
  fs.writeFileSync(path.join(ld, 'a.js'), `${logic}export const a = 1;\n`);
  fs.writeFileSync(path.join(ld, 'b.js'), `export const b = 2;\n${logic}`);
  assert.ok(scan([ld], { ignoreBase: ld }).findings.some((f) => f.id === '068' && f.severity === 'major'), 'logic dup is major');

  const mui = '      <Box sx={{ p: 2, borderRadius: 2, bgcolor: "paper", boxShadow: 1 }}>\n        <Typography variant="h6" color="text.primary" gutterBottom>\n          {title}\n        </Typography>\n        <Typography variant="body2" color="text.secondary">\n          {subtitle}\n        </Typography>\n        <Chip size="small" label={status} color="success" variant="outlined" />\n        <IconButton onClick={onClose} aria-label="close" size="small" />\n        <Divider sx={{ my: 1 }} />\n      </Box>\n';
  const md = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-md-'));
  fs.writeFileSync(path.join(md, 'c.tsx'), `function C(){ return (\n${mui}); }\nexport const x = 1;\n`);
  fs.writeFileSync(path.join(md, 'd.tsx'), `export const y = 2;\nfunction D(){ return (\n${mui}); }\n`);
  const dup = scan([md], { ignoreBase: md }).findings.filter((f) => f.id === '068');
  assert.ok(dup.length > 0 && dup.every((f) => f.severity === 'minor'), 'repeated markup is minor');
});

test('the weighted score caps a single noisy rule', () => {
  let src = '';
  for (let i = 0; i < 15; i += 1) src += `console.log(${i});\n`;
  const s = score(scan(tmpFile('a.js', src)));
  assert.strictEqual(s.byRule['052'], 15, 'true count preserved');
  assert.ok(s.capped, 'cap engaged');
  assert.ok(s.weighted < 15 * 3, 'one rule cannot run the score away');
});

test('068 flags an identical block copy-pasted across files, not a unique one', () => {
  const block = 'function totals(items, rate) {\n  let sub = 0;\n  for (const it of items) {\n    sub += it.price * it.qty;\n  }\n  const tax = sub * rate;\n  return { sub, tax, total: sub + tax };\n}\n';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-dup-'));
  fs.writeFileSync(path.join(dir, 'a.js'), `${block}export const a = 1;\n`);
  fs.writeFileSync(path.join(dir, 'b.js'), `export const b = 2;\n${block}`);
  assert.ok(ids(scan([dir], { ignoreBase: dir })).includes('068'), 'copy-paste across files is flagged');
  const solo = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-solo-'));
  fs.writeFileSync(path.join(solo, 'c.js'), block);
  assert.ok(!ids(scan([solo], { ignoreBase: solo })).includes('068'), 'a single copy is not duplication');
});

test('inline suppression skips the targeted rule on the next line only', () => {
  const p = tmpFile('a.ts', '// slopscore-disable-next-line 054 — fix in 2 weeks\nconst x: any = 1;\nconst y: any = 2;\n');
  const r = scan(p);
  assert.deepStrictEqual(r.findings.filter((f) => f.id === '054').map((f) => f.line), [3], 'line 2 suppressed, 3 kept');
  assert.strictEqual(r.suppressed, 1);
  // the "2 weeks" reason must not be parsed as rule 002
  assert.ok(!r.findings.some((f) => f.id === '002'));
});

test('findings carry a confidence: precise rules high, heuristics softer', () => {
  const high = scan(tmpFile('a.js', 'const k = "sk-abcdef0123456789abcdef";\n')).findings.find((f) => f.id === '058');
  assert.strictEqual(high.confidence, 'high', 'a secret match is high confidence');
  const visual = scan(tmpFile('b.tsx', 'export const C = () => <div sx={{ backdropFilter: "blur(8px)" }} />;\n')).findings.find((f) => f.id === '003');
  assert.strictEqual(visual.confidence, 'medium', 'a visual idiom is medium');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-dup-'));
  const block = 'function totals(items, rate) {\n  let sub = 0;\n  for (const it of items) {\n    sub += it.price * it.qty;\n  }\n  const tax = sub * rate;\n  return { sub, tax };\n}\n';
  fs.writeFileSync(path.join(dir, 'a.js'), `${block}export const a = 1;\n`);
  fs.writeFileSync(path.join(dir, 'b.js'), `export const b = 2;\n${block}`);
  const dup = scan([dir], { ignoreBase: dir }).findings.find((f) => f.id === '068');
  assert.strictEqual(dup.confidence, 'low', 'the line-hash dup heuristic is low');
});

test('--min-confidence filters out softer findings before scoring', () => {
  const f = tmpFile('a.tsx', 'export const C = () => <div sx={{ backdropFilter: "blur(8px)" }} />;\n');
  assert.match(runBin(['scan', f, '--no-color']), /\[003\]/);
  assert.match(runBin(['scan', f, '--min-confidence', 'high', '--no-color']), /No slop patterns detected/);
});

test('a suppression that hides nothing is reported as stale', () => {
  const p = tmpFile('a.js', '// slopscore-disable-next-line 052 — debug log, since removed\nconst x = 1;\nexport default x;\n');
  const r = scan(p);
  assert.strictEqual(r.staleSuppressions.length, 1, 'the dead directive is stale');
  assert.deepStrictEqual(r.staleSuppressions[0].ids, ['052']);
});

test('a suppression that hides a real finding is NOT stale', () => {
  const p = tmpFile('a.ts', '// slopscore-disable-next-line 054 — deliberate\nconst x: any = 1;\n');
  const r = scan(p);
  assert.strictEqual(r.staleSuppressions.length, 0, 'a working suppression is not stale');
});

test('a documented/quoted directive is not treated as a real directive', () => {
  // The leading text of the first comment is `// slopscore-...`, i.e. another
  // comment — this is prose ABOUT the directive, not the directive itself.
  const p = tmpFile('a.js', '//   // slopscore-disable-next-line 052 — example in a doc comment\nconst x = 1;\n');
  const r = scan(p);
  assert.strictEqual(r.staleSuppressions.length, 0, 'a doc example must not register as a directive');
});

test('per-path config disables a rule under one directory only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-pp-'));
  fs.mkdirSync(path.join(dir, 'legacy'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'legacy', 'o.ts'), 'const x: any = 1;\n');
  fs.writeFileSync(path.join(dir, 'src', 'n.ts'), 'const y: any = 1;\n');
  const flagged = scan([dir], { ignoreBase: dir, paths: { 'legacy/': { '054': false } } })
    .findings.filter((f) => f.id === '054').map((f) => f.file);
  assert.ok(flagged.some((f) => f.includes('src')), 'src still flagged');
  assert.ok(!flagged.some((f) => f.includes('legacy')), 'legacy suppressed');
});

test('per-rule config disables a rule and overrides severity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-rc-'));
  fs.writeFileSync(path.join(dir, 'app.ts'), 'const x: any = 1;\nconst u = "http://localhost:3000";\n');
  const r = scan([dir], { ignoreBase: dir, rules: { '054': false, '099': 'minor' } });
  assert.ok(!r.findings.some((f) => f.id === '054'), '054 disabled');
  assert.strictEqual((r.findings.find((f) => f.id === '099') || {}).severity, 'minor', '099 downgraded');
});

test('--sarif emits valid SARIF 2.1.0 for code scanning', () => {
  const fixture = path.join(__dirname, '..', 'examples', 'slop.tsx');
  const out = execFileSync('node', [BIN, 'scan', fixture, '--sarif', '--fail-on', 'never'], { encoding: 'utf8' });
  const j = JSON.parse(out);
  assert.strictEqual(j.version, '2.1.0');
  assert.strictEqual(j.runs[0].tool.driver.name, 'slopscore');
  assert.ok(j.runs[0].results.length > 0, 'has results');
  const r = j.runs[0].results[0];
  assert.ok(['error', 'warning', 'note'].includes(r.level), 'valid level');
  assert.ok(r.locations[0].physicalLocation.region.startLine >= 1, 'has a line');
});

// Language-specific: Python (Category 17)
test('Python detectors fire on the canonical tells', () => {
  const py = tmpFile('a.py', [
    'def f(items=[]):',
    '    if x == None:',
    '        return eval(inp)',
    '    q = f"SELECT * FROM u WHERE id={uid}"',
    '    os.system(f"rm {p}")',
    '    try:',
    '        go()',
    '    except:',
    '        pass',
  ].join('\n') + '\n');
  const got = ids(scan(py));
  for (const id of ['151', '152', '153', '154', '155', '078']) {
    assert.ok(got.includes(id), `expected Python rule ${id}`);
  }
});

test('Python negatives: is None, parameterized SQL, args-list subprocess', () => {
  const py = tmpFile('b.py', 'if x is None:\n    cursor.execute("SELECT 1 FROM t WHERE id = %s", (uid,))\n    subprocess.run(["rm", p])\n');
  const got = ids(scan(py));
  for (const id of ['151', '152', '153', '154', '155']) assert.ok(!got.includes(id), `unexpected ${id}`);
});

// Language-specific: Go + Rust (Category 17)
test('Go detectors fire on the canonical tells, not on a range loop', () => {
  const go = tmpFile('a.go', 'func f() {\n\tvar x interface{}\n\tval, _ := strconv.Atoi(s)\n\tfmt.Println(val)\n\tcmd := exec.Command("sh", "-c", "rm "+p)\n\tfor i, _ := range items { _ = i }\n}\n');
  const got = ids(scan(go));
  for (const id of ['156', '157', '158', '159']) assert.ok(got.includes(id), `expected Go rule ${id}`);
});

test('Rust detectors fire on unwrap / todo! / unsafe', () => {
  const rs = tmpFile('a.rs', 'fn main() {\n    let x = r.unwrap();\n    let y = o.expect("nope");\n    todo!();\n    unsafe { core::ptr::read(p) };\n}\n');
  const got = ids(scan(rs));
  for (const id of ['160', '161', '162']) assert.ok(got.includes(id), `expected Rust rule ${id}`);
});

// `slopscore explain <id>` surfaces a single catalog entry from the CLI.
test('explain prints a catalog entry + fix for a valid id', () => {
  const out = execFileSync('node', [BIN, 'explain', '058'], { encoding: 'utf8' });
  assert.match(out, /058 ·/);
  assert.match(out, /`FIX:`/);
  assert.match(out, /Automated/);
});

// The demo file scores high, so `scan` exits non-zero; execFileSync throws but
// still carries the captured stdout. This grabs output regardless of exit code.
function runBin(args, opts = {}) {
  try {
    return execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
  } catch (e) {
    return e.stdout != null ? e.stdout : '';
  }
}

test('--ascii renders slopscore chrome with no non-ASCII bytes (legacy Windows console)', () => {
  // An ASCII-only source, so any non-ASCII byte in the output is slopscore's own
  // chrome (box-drawing / emoji), not quoted user content.
  const src = tmpFile('a.js', 'function f(){ console.log("x"); }\nconst y: any = 1;\n');
  const out = runBin(['scan', src, '--ascii', '--no-color']);
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[^\x00-\x7F]/.test(out), 'ASCII mode must not emit any non-ASCII glyph');
  assert.match(out, /S L O P {3}S C O R E/); // the banner still draws, in ASCII
  assert.match(out, /\+={3,}\+/); // ASCII box border, not Unicode ═
});

test('the default report uses Unicode glyphs', () => {
  const out = runBin(['scan', path.join(__dirname, '..', 'examples', 'slop.tsx'), '--unicode', '--no-color']);
  assert.ok(/[╔╗╚╝═║▶]/.test(out), 'Unicode mode draws the box-drawing banner');
});

test('--out writes a UTF-8 report file (not shell-dependent encoding)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-out-'));
  const file = path.join(dir, 'report.md');
  runBin(['scan', path.join(__dirname, '..', 'examples', 'slop.tsx'), '--markdown', '--out', file]);
  const buf = fs.readFileSync(file);
  assert.ok(buf.length > 0, 'file written');
  // A UTF-8 file has no UTF-16 BOM (0xFF 0xFE) and round-trips its emoji.
  assert.ok(!(buf[0] === 0xFF && buf[1] === 0xFE), 'must not be UTF-16');
  assert.match(buf.toString('utf8'), /Slop Report/);
});

test('--help and --version print real content (guards against a broken HELP literal)', () => {
  const help = runBin(['--help']);
  assert.match(help, /USAGE/);
  assert.match(help, /slopscore fix/);
  assert.ok(help.length > 500, 'help must be the full usage text, not a stray value');
  assert.strictEqual(runBin(['--version']).trim(), require('../package.json').version);
});

test('explain errors (exit 2) on an out-of-range id', () => {
  assert.throws(
    () => execFileSync('node', [BIN, 'explain', '999'], { encoding: 'utf8', stdio: 'pipe' }),
    (e) => e.status === 2,
  );
});

// The keystone invariant: a linter about not shipping slop must not BE slop.
// This scans slopscore's own repository with its real .slopscore.json config and
// asserts zero findings. If any future rule flags slopscore's own source, this
// test fails here — at PR time — instead of in front of Hacker News.
test('slopscore passes its own scan (eats its own dog food)', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const cfg = JSON.parse(fs.readFileSync(path.join(repoRoot, '.slopscore.json'), 'utf8'));
  const result = scan([repoRoot], { ignore: cfg.ignore || [], ignoreBase: repoRoot });
  const detail = result.findings
    .map((f) => `  ${f.file}:${f.line} [${f.id}] ${f.title}`)
    .join('\n');
  assert.strictEqual(
    result.findings.length, 0,
    `slopscore flagged its own source — fix the code or the rule:\n${detail}`,
  );
});

// A tool about not shipping inconsistencies must reconcile its own counts.
// The "⚙️ slopscore scan" tags in the catalog, the detector rule table, and every
// headline number ("66 detectors", "66 of the 162") must agree exactly — forever.
test('catalog ⚙️ tags, the detector table, and the headline counts all agree', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const rules = require('../src/rules');
  const detectorIds = new Set(
    rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES).map((r) => r.id),
  );

  const protocol = fs.readFileSync(path.join(repoRoot, 'ANTI_SLOP_PROTOCOL.md'), 'utf8');
  const lines = protocol.split('\n');
  const headingIds = [];
  const taggedIds = new Set();
  for (const line of lines) {
    const m = line.match(/^\*\*(\d{3}) /);
    if (!m) continue;
    headingIds.push(m[1]);
    if (line.includes('slopscore scan')) taggedIds.add(m[1]);
  }

  // 1. Every catalog entry is unique. The total (m) is derived, not hardcoded, so
  //    growing the catalog only requires updating the prose the checks below pin.
  assert.strictEqual(new Set(headingIds).size, headingIds.length, 'duplicate catalog id');
  const m = headingIds.length;
  assert.ok(m >= 162, `catalog should not shrink below 162 (found ${m})`);

  // 2. The ⚙️-tagged set equals the real detector table — no aspirational tags,
  //    no silent detector that forgot its tag.
  const onlyTagged = [...taggedIds].filter((id) => !detectorIds.has(id));
  const onlyDetector = [...detectorIds].filter((id) => !taggedIds.has(id));
  assert.deepStrictEqual(onlyTagged, [], `tagged in catalog but no detector: ${onlyTagged}`);
  assert.deepStrictEqual(onlyDetector, [], `detector exists but catalog untagged: ${onlyDetector}`);

  // 3. Every headline number matches reality (n detectors out of m patterns).
  const n = detectorIds.size;
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  assert.ok(readme.includes(`${n} detectors`), `README must say "${n} detectors"`);
  assert.ok(readme.includes(`${n} of the ${m}`), `README must say "${n} of the ${m}"`);
  assert.ok(readme.includes(`${m}-pattern`), `README must say "${m}-pattern"`);
  assert.ok(protocol.includes(`**${n} of the ${m}**`), `catalog must say "${n} of the ${m}"`);
  const rulesOut = execFileSync('node', [BIN, 'rules'], { encoding: 'utf8' });
  assert.ok(rulesOut.includes(`${n} deterministic detectors`), `rules must say "${n} deterministic detectors"`);
  assert.ok(rulesOut.includes(`${m}-pattern`), `rules must say "${m}-pattern catalog"`);
});

// Regression guard for the ignore-path bug: a configured ignore like
// "src/rules.js" must be honored even when the scan root is a sub-path
// (e.g. `slopscore scan src`), not only when scanning the repo root.
test('configured ignore paths are honored from any scan root', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-ig-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'rules.js'), 'const k = "sk-abcdef0123456789abcdef";\n');
  fs.writeFileSync(path.join(dir, 'src', 'real.js'), 'export const ok = 1;\n');
  const result = scan([path.join(dir, 'src')], { ignore: ['src/rules.js'], ignoreBase: dir });
  assert.ok(!result.findings.some((f) => /rules\.js$/.test(f.file)),
    'ignore "src/rules.js" should suppress findings even when scanning src directly');
});
