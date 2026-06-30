'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { resolvePreset, presetNames } = require('../src/presets');

const BIN = path.join(__dirname, '..', 'bin', 'slopscore.js');

function tmpDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-preset-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}
function runBin(args, cwd) {
  try { return execFileSync('node', [BIN, ...args], { encoding: 'utf8', cwd }); }
  catch (e) { return { out: e.stdout || '', err: e.stderr || '', status: e.status }; }
}

test('resolvePreset returns a rules fragment; unknown names return null', () => {
  assert.ok(resolvePreset('library').rules, 'library is known');
  assert.strictEqual(resolvePreset('nope'), null);
  assert.ok(presetNames().includes('mui') && presetNames().includes('cli'));
});

test('the library preset disables visual / copy / a11y but keeps code, security, perf', () => {
  const frag = resolvePreset('library').rules;
  const rules = require('../src/rules');
  const all = rules.LINE_RULES.concat(rules.WHOLE_FILE_RULES, rules.META_RULES);
  for (const r of all) {
    if (['visual', 'copy', 'a11y'].includes(r.category)) assert.strictEqual(frag[r.id], false, `${r.id} (${r.category}) off`);
    else assert.ok(!(r.id in frag), `${r.id} (${r.category}) untouched`);
  }
});

test('the cli preset also silences stdout debug rules (console.log / print)', () => {
  const frag = resolvePreset('cli').rules;
  for (const id of ['052', '178', '180']) assert.strictEqual(frag[id], false, `${id} off for cli`);
});

test('framework presets are web UI — they do not disable anything', () => {
  for (const name of ['mui', 'tailwind', 'chakra']) {
    assert.deepStrictEqual(resolvePreset(name).rules, {}, `${name} keeps every check`);
  }
});

test('--preset library suppresses a glassmorphism finding end-to-end', () => {
  const dir = tmpDir({ 'a.tsx': 'export const C = () => <div sx={{ backdropFilter: "blur(8px)" }} />;\n' });
  assert.match(runBin(['scan', dir, '--no-color']).toString(), /\[003\]/);
  const filtered = runBin(['scan', dir, '--preset', 'library', '--no-color']).toString();
  assert.ok(!/\[003\]/.test(filtered), '003 is gone under library');
});

test('a "preset" key in .slopscore.json is honored', () => {
  const dir = tmpDir({
    'a.tsx': 'export const C = () => <div sx={{ backdropFilter: "blur(8px)" }} />;\n',
    '.slopscore.json': '{ "preset": "library" }\n',
  });
  const outAt = runBin(['scan', '.', '--no-color'], dir).toString();
  assert.ok(!/\[003\]/.test(outAt), 'config preset suppresses the visual finding');
});

test('an unknown --preset exits 2 with the list of valid names', () => {
  const dir = tmpDir({ 'a.js': 'const x = 1;\n' });
  const r = runBin(['scan', dir, '--preset', 'bogus']);
  assert.strictEqual(r.status, 2);
  assert.match(r.err, /unknown preset/);
});
