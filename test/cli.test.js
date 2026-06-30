'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BIN = path.join(__dirname, '..', 'bin', 'slopscore.js');
const DEMO = path.join(__dirname, '..', 'examples', 'slop.tsx');

function run(args) {
  try {
    return { out: execFileSync('node', [BIN, ...args], { encoding: 'utf8' }), status: 0, err: '' };
  } catch (e) {
    return { out: e.stdout || '', err: e.stderr || '', status: e.status };
  }
}

test('repeated same-rule findings are clustered so real findings surface first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-cluster-'));
  // 20 design-system cards that each trip 068 (repeated markup) + one real critical
  const card = (n) => `export const Card${n} = ({ title, subtitle, status }) => (\n  <Box sx={{ p: 2, borderRadius: 2, bgcolor: "paper", boxShadow: 1 }}>\n    <Typography variant="h6" color="text.primary" gutterBottom>{title}</Typography>\n    <Typography variant="body2" color="text.secondary">{subtitle}</Typography>\n    <Chip size="small" label={status} color="success" variant="outlined" />\n    <Divider sx={{ my: 1 }} />\n    <Button fullWidth variant="contained">Open</Button>\n  </Box>\n);\n`;
  for (let n = 0; n < 20; n += 1) fs.writeFileSync(path.join(dir, `Card${n}.tsx`), card(n));
  fs.writeFileSync(path.join(dir, 'danger.ts'), 'const r = eval(userInput);\n');
  const out = run(['scan', dir, '--no-color']).out;
  // the real critical is shown
  assert.match(out, /\[172\] eval/);
  // the dup-block wall is collapsed into a single summary, not 20 separate lines
  assert.match(out, /\+\d+ more \[068\].*repeated pattern/);
  const shown068 = (out.match(/^ {4}:\d+ {2}.*\[068\]/gm) || []).length;
  assert.ok(shown068 <= 3, `068 inline lines clustered to <=3 (got ${shown068})`);
});

test('--max 0 prints zero findings (0 is not "unlimited")', () => {
  const lines = run(['scan', DEMO, '--max', '0', '--no-color']).out.split('\n').filter((l) => /^ {4}:\d+ {2}/.test(l));
  assert.strictEqual(lines.length, 0);
});

test('piped/redirected output carries no ANSI escape codes', () => {
  // execFileSync is not a TTY, so color must auto-disable.
  assert.ok(!run(['scan', DEMO]).out.includes('\x1b['), 'no ANSI when not a TTY');
});

test('--out writes a terminal report with no ANSI codes', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-out-')), 'r.txt');
  run(['scan', DEMO, '--out', file]);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('\x1b['), 'file has no ANSI');
});

test('--out to an unwritable path fails cleanly (exit 2, no stack trace)', () => {
  const r = run(['scan', DEMO, '--out', '/nonexistent_dir_xyz/r.md']);
  assert.strictEqual(r.status, 2);
  assert.match(r.err, /cannot write/);
  assert.ok(!r.err.includes('at Object.'), 'no raw Node stack trace');
});

test('--ascii leaves no non-ASCII in the by-rule summary line', () => {
  const line = run(['scan', DEMO, '--ascii', '--no-color']).out.split('\n').find((l) => l.includes('by rule'));
  assert.ok(line, 'by-rule line present');
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[^\x00-\x7F]/.test(line), 'by-rule line is pure ASCII under --ascii');
});

test('typo\'d flag values exit 2 instead of silently misbehaving', () => {
  assert.strictEqual(run(['scan', DEMO, '--category', 'nonsense']).status, 2);
  assert.strictEqual(run(['scan', DEMO, '--fail-on', 'garbage']).status, 2);
  assert.strictEqual(run(['scan', DEMO, '--min-confidence', 'garbage']).status, 2);
});

test('valid flag values still work', () => {
  assert.strictEqual(run(['scan', DEMO, '--fail-on', 'never']).status, 0);
  assert.strictEqual(run(['scan', DEMO, '--category', 'security']).status, 1); // demo has findings
});

test('explain with non-numeric input shows the usage hint', () => {
  const r = run(['explain', 'abc']);
  assert.strictEqual(r.status, 2);
  assert.match(r.err, /usage — slopscore explain/);
});
