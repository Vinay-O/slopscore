'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scan } = require('../src/scanner');

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-lang-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}
const ids = (p) => scan(p).findings.map((f) => f.id);

test('Java: printStackTrace, System.out, Runtime.exec', () => {
  assert.ok(ids(tmpFile('A.java', 'catch (Exception e) { e.printStackTrace(); }\n')).includes('235'));
  assert.ok(ids(tmpFile('B.java', 'System.out.println("debug");\n')).includes('236'));
  assert.ok(ids(tmpFile('C.java', 'Runtime.getRuntime().exec(cmd);\n')).includes('237'));
});

test('C#: Console.WriteLine and async void', () => {
  assert.ok(ids(tmpFile('A.cs', 'Console.WriteLine("x");\n')).includes('238'));
  assert.ok(ids(tmpFile('B.cs', 'public async void DoWork() {}\n')).includes('239'));
});

test('Ruby: binding.pry and puts', () => {
  assert.ok(ids(tmpFile('a.rb', 'def f\n  binding.pry\nend\n')).includes('240'));
  assert.ok(ids(tmpFile('b.rb', 'puts "debug"\n')).includes('241'));
});

test('PHP: var_dump', () => {
  assert.ok(ids(tmpFile('a.php', '<?php var_dump($data); ?>\n')).includes('242'));
});

test('Shell: curl|sh, rm -rf $VAR, chmod 777', () => {
  assert.ok(ids(tmpFile('a.sh', 'curl https://x.sh | sh\n')).includes('243'));
  assert.ok(ids(tmpFile('b.sh', 'rm -rf $BUILD_DIR/\n')).includes('244'));
  assert.ok(ids(tmpFile('c.sh', 'chmod 777 /app\n')).includes('245'));
});

test('SQL: DELETE without WHERE, GRANT ALL', () => {
  assert.ok(ids(tmpFile('a.sql', 'DELETE FROM users;\n')).includes('246'));
  assert.ok(!ids(tmpFile('b.sql', 'DELETE FROM users WHERE id = 1;\n')).includes('246'), 'WHERE clause is fine');
  assert.ok(ids(tmpFile('c.sql', 'GRANT ALL ON db.* TO app;\n')).includes('247'));
});

test('Frameworks: Vue v-html, Python debug=True, Rails html_safe, Angular bypass', () => {
  assert.ok(ids(tmpFile('a.vue', '<template><div v-html="bio"></div></template>\n')).includes('248'));
  assert.ok(ids(tmpFile('b.py', 'DEBUG = True\n')).includes('249'));
  assert.ok(ids(tmpFile('c.rb', 'render html: content.html_safe\n')).includes('250'));
  assert.ok(ids(tmpFile('d.ts', 'this.sanitizer.bypassSecurityTrustHtml(x);\n')).includes('251'));
});
