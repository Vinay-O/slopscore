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
