'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-deep-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const has = (name, src, id) => [...new Set(scan(tmpFile(name, src)).findings.map((f) => f.id))].includes(id);

test('253 path traversal — fires on request-derived path, not a constant', () => {
  assert.ok(has('a.js', 'fs.readFileSync(req.params.file);\n', '253'));
  assert.ok(!has('b.js', 'fs.readFileSync(configPath);\n', '253'));
  assert.ok(!has('c.js', 'fs.writeFileSync(out, JSON.stringify(body));\n', '253'), 'a local var named body is not req.body');
});

test('254 open redirect — fires on user-derived target', () => {
  assert.ok(has('a.js', 'res.redirect(req.query.next);\n', '254'));
  assert.ok(!has('b.js', 'res.redirect("/dashboard");\n', '254'));
});

test('255 SSRF — fires on fetch of a user URL', () => {
  assert.ok(has('a.js', 'const r = await fetch(req.query.url);\n', '255'));
  assert.ok(!has('b.js', 'const r = await fetch("https://api.example.com/v1");\n', '255'));
});

test('256 NoSQL injection — fires on a request-fed operator', () => {
  assert.ok(has('a.js', 'User.find({ name: { $ne: req.body.name } });\n', '256'));
  assert.ok(has('b.js', 'db.find({ $where: "this.x == 1" });\n', '256'));
  assert.ok(!has('c.js', 'User.find({ name: { $ne: null } });\n', '256'), 'no request source → no finding');
});

test('257 mass assignment — fires on req.body persisted wholesale', () => {
  assert.ok(has('a.js', 'const u = new User(req.body);\n', '257'));
  assert.ok(has('b.js', 'await User.update(req.body);\n', '257'));
  assert.ok(!has('c.js', 'const u = new User({ name: req.body.name });\n', '257'), 'allowlisted field is fine');
});

test('258 insecure cookie — fires on httpOnly/secure false', () => {
  assert.ok(has('a.js', 'res.cookie("s", v, { httpOnly: false });\n', '258'));
  assert.ok(has('b.js', 'app.use(session({ cookie: { secure: false } }));\n', '258'));
  assert.ok(!has('c.js', 'res.cookie("s", v, { httpOnly: true, secure: true });\n', '258'));
});

test('259 weak cipher — createCipher fires, createCipheriv does not', () => {
  assert.ok(has('a.js', 'const c = crypto.createCipher("aes192", key);\n', '259'));
  assert.ok(!has('b.js', 'const c = crypto.createCipheriv("aes-256-gcm", key, iv);\n', '259'));
});

test('260/261/262 Kotlin/Swift tells', () => {
  assert.ok(has('a.kt', 'val name = user!!.name\n', '260'));
  assert.ok(has('b.swift', 'let d = try! JSONDecoder().decode(T.self, from: raw)\n', '261'));
  assert.ok(has('c.kt', 'println("debug $x")\n', '262'));
  assert.ok(has('d.swift', 'print("debug", x)\n', '262'));
});

test('263/264 C/C++ security', () => {
  assert.ok(has('a.c', 'char buf[8]; strcpy(buf, input);\n', '263'));
  assert.ok(has('b.cpp', 'sprintf(out, "%s", src);\n', '263'));
  assert.ok(has('c.c', 'system(command);\n', '264'));
  assert.ok(!has('d.c', 'int n = snprintf(out, sizeof(out), "%s", src);\n', '263'), 'snprintf is the safe variant');
});

test('the new security detectors are categorized security', () => {
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const id of ['253', '254', '255', '256', '257', '258', '259', '263', '264']) {
    assert.strictEqual(all.find((r) => r.id === id).category, 'security', `${id} is security`);
  }
});

test('265-271 language-depth + cross-language security tells', () => {
  assert.ok(has('a.go', 'ctx := context.TODO()\n', '265'));
  assert.ok(has('A.java', 'if (mode == "prod") { run(); }\n', '266'));
  assert.ok(!has('B.java', 'if (mode.equals("prod")) { run(); }\n', '266'), '.equals is correct');
  assert.ok(has('A.cs', 'try { Do(); } catch (Exception) {}\n', '267'));
  assert.ok(has('a.rb', 'eval(user_code)\n', '268'));
  assert.ok(has('a.php', '<?php mysqli_query($db, $_GET["id"]); ?>\n', '269'));
  assert.ok(has('a.py', 'return render_template_string(tpl)\n', '270'));
  assert.ok(has('a.js', 'if (token === expected) grant();\n', '271'));
  assert.ok(!has('b.js', 'if (count === 0) stop();\n', '271'), 'non-secret comparison is fine');
});

test('272/273 secrets-in-logs and CORS-reflect-any-origin', () => {
  assert.ok(has('a.js', 'console.log(user.password);\n', '272'));
  assert.ok(has('b.js', 'logger.info(req.body);\n', '272'));
  assert.ok(!has('c.js', 'console.log("done", count);\n', '272'), 'non-sensitive log is fine');
  assert.ok(has('d.js', 'app.use(cors({ origin: true }));\n', '273'));
  assert.ok(!has('e.js', 'app.use(cors({ origin: ["https://x.com"] }));\n', '273'), 'allowlist is fine');
});

test('068 near-duplication: blocks differing only in literals are caught', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-nd-'));
  const blk = (m, k) => `function process(items) {\n  const results = items.map((x) => x.value);\n  const total = results.reduce((a, b) => a + b, ${k});\n  const average = total / results.length;\n  logger.info("${m}");\n  return { total: total, average: average, ok: true };\n}\n`;
  fs.writeFileSync(path.join(dir, 'a.js'), blk('complete', 0));
  fs.writeFileSync(path.join(dir, 'b.js'), blk('done', 1));
  assert.ok(scan([dir], { ignoreBase: dir }).findings.some((f) => f.id === '068'), 'literal-only variation is a near-duplicate');
});
