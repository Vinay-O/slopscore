#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { scan } = require('../src/scanner');
const { score } = require('../src/score');
const report = require('../src/report');
const { LINE_RULES, WHOLE_FILE_RULES, META_RULES } = require('../src/rules');
const { fingerprint, loadBaseline, writeBaseline } = require('../src/baseline');

const DEFAULT_BASELINE = '.slopscore-baseline.json';

const out = (s) => process.stdout.write(s + '\n');
const err = (s) => process.stderr.write(s + '\n');
const pkg = require('../package.json');

// Exit cleanly when a downstream pipe (e.g. `| head`) closes early.
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });

function parseArgs(argv) {
  const opts = { paths: [], format: 'terminal', max: 40, ignore: [], failOn: 'major', color: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opts.format = 'json';
    else if (a === '--markdown' || a === '--md') opts.format = 'markdown';
    else if (a === '--format') opts.format = argv[++i];
    else if (a === '--no-color') opts.color = false;
    else if (a === '--max') { const v = parseInt(argv[++i], 10); if (Number.isInteger(v) && v >= 0) opts.max = v; }
    else if (a === '--fail-on') { opts.failOn = argv[++i]; opts.failOnSet = true; }
    else if (a === '--ignore') opts.ignore.push(argv[++i]);
    else if (a === '--baseline') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) { opts.baseline = next; i += 1; } else opts.baseline = DEFAULT_BASELINE;
    } else if (a === '--update-baseline') { opts.updateBaseline = true; opts.baseline = opts.baseline || DEFAULT_BASELINE; }
    else if (!a.startsWith('-')) opts.paths.push(a);
  }
  if (opts.paths.length === 0) opts.paths.push('.');
  return opts;
}

// Returns the parsed config plus the directory it was found in. Configured
// ignore paths resolve against that directory, so an ignore like "src/rules.js"
// is honored no matter which sub-path the user points the scan at.
function loadConfig(startDir) {
  let dir = path.resolve(startDir);
  const names = ['.slopscore.json', '.slopscorerc.json'];
  for (;;) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) {
        try { return { config: JSON.parse(fs.readFileSync(p, 'utf8')), baseDir: dir }; }
        catch { return { config: {}, baseDir: dir }; }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { config: {}, baseDir: path.resolve(startDir) };
}

function configStartDir(paths) {
  const first = path.resolve(paths[0]);
  try { return fs.statSync(first).isDirectory() ? first : path.dirname(first); }
  catch { return process.cwd(); }
}

// Severity rank (higher = worse) and the gate each --fail-on level opens.
// A run fails if any finding's rank meets or exceeds the gate.
//   --fail-on critical → only critical fails
//   --fail-on major    → critical + major fail
//   --fail-on minor    → any finding fails
//   --fail-on never    → nothing fails
const SEV_RANK = { critical: 3, major: 2, minor: 1 };
const FAIL_GATE = { critical: 3, major: 2, minor: 1, never: 4 };

function runScan(opts) {
  report.setColor(opts.color && process.stdout.isTTY !== false);
  for (const p of opts.paths) {
    if (!fs.existsSync(p)) { err(`slopscore: path not found: ${p}`); process.exit(2); }
  }
  const { config: cfg, baseDir } = loadConfig(configStartDir(opts.paths));
  const ignore = (cfg.ignore || []).concat(opts.ignore);
  const failOn = opts.failOnSet ? opts.failOn : (cfg.failOn || opts.failOn);
  const result = scan(opts.paths, { ignore, ignoreBase: baseDir });

  // Baseline / ratchet mode: snapshot accepted findings, then fail only on NEW slop.
  if (opts.baseline) {
    const existing = opts.updateBaseline ? null : loadBaseline(opts.baseline);
    if (!existing) {
      const n = writeBaseline(opts.baseline, result.findings, new Date().toISOString());
      out(`slopscore: ${opts.updateBaseline ? 'updated' : 'wrote'} baseline ${opts.baseline} (${n} findings).`);
      out('Future scans with --baseline report and gate only on NEW slop.');
      process.exit(0);
    }
    const known = result.findings.filter((f) => existing.has(fingerprint(f))).length;
    result.findings = result.findings.filter((f) => !existing.has(fingerprint(f)));
    result.baseline = { known, file: opts.baseline };
  }

  const s = score(result);
  if (opts.format === 'json') report.jsonReport(result, s);
  else if (opts.format === 'markdown') report.markdownReport(result, s);
  else if (opts.format === 'agent') report.agentReport(result, s);
  else report.terminalReport(result, s, { max: opts.max });

  // The CI gate fails on PRODUCTION findings only (test/tooling is reported, not gated)
  // — and, under --baseline, only on findings new since the snapshot.
  const gate = FAIL_GATE[failOn] || FAIL_GATE.major;
  const failing = result.findings.some((f) => f.zone !== 'test' && SEV_RANK[f.severity] >= gate);
  process.exit(failing ? 1 : 0);
}

function printProtocol() {
  const p = path.join(__dirname, '..', 'ANTI_SLOP_PROTOCOL.md');
  if (fs.existsSync(p)) out(fs.readFileSync(p, 'utf8'));
  else err('slopscore: ANTI_SLOP_PROTOCOL.md not found alongside the package.');
}

function printRules() {
  const all = LINE_RULES.concat(WHOLE_FILE_RULES, META_RULES);
  out(`slopscore ships ${all.length} deterministic detectors. The full 150-pattern catalog`);
  out('(including visual, architectural, and judgment-heavy patterns) lives in ANTI_SLOP_PROTOCOL.md.\n');
  const byCat = {};
  for (const r of all) (byCat[r.category] = byCat[r.category] || []).push(r);
  for (const cat of Object.keys(byCat).sort()) {
    out(`  ${cat.toUpperCase()}`);
    for (const r of byCat[cat]) out(`    [${r.id}] ${r.severity.padEnd(8)} ${r.authority.padEnd(7)} ${r.title}`);
    out('');
  }
}

function printExplain(arg) {
  const id = String(arg || '').replace(/[^0-9]/g, '').padStart(3, '0');
  if (!/^\d{3}$/.test(id)) {
    err('slopscore: usage — slopscore explain <id>   e.g. slopscore explain 058');
    process.exit(2);
  }
  const p = path.join(__dirname, '..', 'ANTI_SLOP_PROTOCOL.md');
  if (!fs.existsSync(p)) { err('slopscore: ANTI_SLOP_PROTOCOL.md not found alongside the package.'); process.exit(2); }
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith(`**${id} · `));
  if (start === -1) { err(`slopscore: no catalog entry ${id} (ids run 001–150). Try: slopscore protocol`); process.exit(2); }
  const block = [lines[start]];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\*\*\d{3} · /.test(lines[i])) break; // next entry
    block.push(lines[i]);
    if (lines[i].startsWith('`FIX:`')) break; // entry ends at its FIX line
  }
  const automated = new Set(LINE_RULES.concat(WHOLE_FILE_RULES, META_RULES).map((r) => r.id));
  out('');
  for (const l of block) out(`  ${l}`);
  out('');
  out(automated.has(id)
    ? '  ⚙️  Automated — `slopscore scan` flags this one for you.'
    : '  ✋  Not automated by the CLI — hand the protocol to your agent for this pattern.');
  out('');
}

const ACTION_YML = `name: anti-slop
on: [pull_request, push]
jobs:
  slopscore:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: Scan for AI slop
        run: npx slopscore scan . --fail-on major
`;

const CONFIG_JSON = `{
  "ignore": ["examples", "fixtures"],
  "failOn": "major"
}
`;

function runInit() {
  writeIfAbsent('.slopscore.json', CONFIG_JSON);
  const dir = path.join('.github', 'workflows');
  fs.mkdirSync(dir, { recursive: true });
  writeIfAbsent(path.join(dir, 'anti-slop.yml'), ACTION_YML);
  out('slopscore initialized. Commit .slopscore.json and .github/workflows/anti-slop.yml to gate every PR.');
}

function writeIfAbsent(file, contents) {
  if (fs.existsSync(file)) { out(`  skip  ${file} (already exists)`); return; }
  fs.writeFileSync(file, contents);
  out(`  wrote ${file}`);
}

const HELP = `
slopscore v${pkg.version} — scan your codebase for AI slop, get a Slop Score, ship clean.

USAGE
  slopscore [scan] [paths...] [options]
  slopscore protocol            print the full 150-pattern protocol (pipe to your agent)
  slopscore rules               list the deterministic detectors this CLI runs
  slopscore explain <id>        print one catalog pattern + its fix (e.g. explain 058)
  slopscore init                write .slopscore.json + a GitHub Action PR gate

OPTIONS
  --json                     machine-readable findings + score
  --markdown                 a Markdown report (great for PR comments)
  --format agent             compact output for feeding an AI agent
  --fail-on <level>          exit non-zero at: critical | major | minor | never  (default: major)
  --baseline [file]          ratchet mode: snapshot current findings, then fail only
                             on NEW slop (default file: .slopscore-baseline.json)
  --update-baseline          re-snapshot the baseline (accept the current findings)
  --max <n>                  max findings to print in the terminal     (default: 40)
  --ignore <path>            extra path to ignore (repeatable)
  --no-color                 disable ANSI color

EXAMPLES
  npx slopscore                         scan the current directory
  npx slopscore scan src --fail-on minor
  npx slopscore examples/slop.tsx       see a deliberately sloppy file score high
  npx slopscore . --markdown > slop.md
  npx slopscore protocol | pbcopy       copy the protocol to hand to Claude/Cursor/etc.

Two ways to use slopscore: run the scanner (deterministic, zero-dependency), or hand
ANTI_SLOP_PROTOCOL.md to your coding agent and say "check the system."
`;

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === '--version' || cmd === '-v') { out(pkg.version); return; }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') { out(HELP); return; }
  if (cmd === 'protocol') { printProtocol(); return; }
  if (cmd === 'rules') { printRules(); return; }
  if (cmd === 'explain') { printExplain(argv[1]); return; }
  if (cmd === 'init') { runInit(); return; }
  const rest = cmd === 'scan' ? argv.slice(1) : argv;
  runScan(parseArgs(rest));
}

main();
