#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { scan } = require('../src/scanner');
const { score } = require('../src/score');
const report = require('../src/report');
const { LINE_RULES, WHOLE_FILE_RULES, META_RULES, looksReDoS } = require('../src/rules');
const { fingerprint, loadBaseline, writeBaseline } = require('../src/baseline');
const { sparkline, loadHistory, appendHistory, trendDelta } = require('../src/history');
const { planFixes, applyPlan, autoFixableIds, optInFixableIds } = require('../src/fix');
const { resolvePreset, presetNames } = require('../src/presets');

const DEFAULT_BASELINE = '.slopscore-baseline.json';
const DEFAULT_HISTORY = '.slopscore-history.json';

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
    else if (a === '--sarif') opts.format = 'sarif';
    else if (a === '--format') opts.format = argv[++i];
    else if (a === '--no-color') opts.color = false;
    else if (a === '--ascii') opts.unicode = false;
    else if (a === '--unicode') opts.unicode = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--dry-run' || a === '-n') opts.dryRun = true;
    else if (a === '--only') opts.only = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--except') opts.except = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--watch' || a === '-w') opts.watch = true;
    else if (a === '--max') { const v = parseInt(argv[++i], 10); if (Number.isInteger(v) && v >= 0) opts.max = v; }
    else if (a === '--fail-on') { opts.failOn = argv[++i]; opts.failOnSet = true; }
    else if (a === '--min-confidence') opts.minConfidence = argv[++i];
    else if (a === '--gate') opts.gate = argv[++i] || 'ship';
    else if (a === '--changed') opts.changed = true;
    else if (a === '--since') { opts.changed = true; opts.since = argv[++i]; }
    else if (a === '--category') opts.category = (argv[++i] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    else if (a === '--preset') opts.preset = argv[++i];
    else if (a === '--ignore') opts.ignore.push(argv[++i]);
    else if (a === '--baseline') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) { opts.baseline = next; i += 1; } else opts.baseline = DEFAULT_BASELINE;
    } else if (a === '--update-baseline') { opts.updateBaseline = true; opts.baseline = opts.baseline || DEFAULT_BASELINE; }
    else if (a === '--history') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) { opts.history = next; i += 1; } else opts.history = DEFAULT_HISTORY;
    } else if (!a.startsWith('-')) opts.paths.push(a);
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

// Warn (don't fail) on an unknown top-level .slopscore.json key. Also provides the
// git-changed file list for --changed/--since. (Kept in src/ so bin stays lean.)
const { validateConfig, gitChangedFiles } = require('../src/diagnostics');

function runDoctor(argv) {
  const opts = parseArgs(argv);
  const { config: cfg, baseDir } = loadConfig(configStartDir(opts.paths));
  out('slopscore doctor');
  out(`  detectors:      ${LINE_RULES.concat(WHOLE_FILE_RULES, META_RULES).length}`);
  const cfgPath = path.join(baseDir, '.slopscore.json');
  out(`  config:         ${fs.existsSync(cfgPath) ? cfgPath : '(none — using defaults)'}`);
  const unknown = validateConfig(cfg);
  if (Object.keys(cfg).length) out(`  config keys:    ${Object.keys(cfg).join(', ')}${unknown.length ? ` (unknown: ${unknown.join(', ')})` : ' ✓'}`);
  out(`  ignore paths:   ${(cfg.ignore || []).join(', ') || '(defaults only)'}`);
  out(`  fail-on:        ${cfg.failOn || 'major (default)'}`);
  if (cfg.preset) out(`  preset:         ${cfg.preset}${resolvePreset(cfg.preset) ? ' ✓' : ' (UNKNOWN)'}`);
  const result = scan(opts.paths, { ignore: cfg.ignore || [], ignoreBase: baseDir, rules: cfg.rules, paths: cfg.paths, customRules: cfg.customRules });
  const stale = result.staleSuppressions || [];
  out(`  files scanned:  ${result.fileCount}`);
  out(`  stale suppressions: ${stale.length}${stale.length ? ` — ${stale.map((s) => `${s.file}:${s.line}`).join(', ')}` : ''}`);
  out(stale.length || unknown.length ? '\n  → fix the items above; otherwise config looks healthy.' : '\n  → healthy.');
}

const VALID_CATEGORIES = new Set(LINE_RULES.concat(WHOLE_FILE_RULES, META_RULES).map((r) => r.category));
const VALID_FAILON = new Set(['critical', 'major', 'minor', 'never']);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);

// Reject typo'd flag values loudly (exit 2) instead of silently doing the wrong
// thing — a typo'd --fail-on or --category must never make a slopful repo pass CI.
function validateOpts(opts) {
  if (opts.failOnSet && !VALID_FAILON.has(opts.failOn)) {
    err(`slopscore: invalid --fail-on "${opts.failOn}". Use: ${[...VALID_FAILON].join(' | ')}`);
    process.exit(2);
  }
  if (opts.minConfidence != null && !VALID_CONFIDENCE.has(opts.minConfidence)) {
    err(`slopscore: invalid --min-confidence "${opts.minConfidence}". Use: ${[...VALID_CONFIDENCE].join(' | ')}`);
    process.exit(2);
  }
  if (opts.category) {
    const bad = opts.category.filter((c) => !VALID_CATEGORIES.has(c));
    if (bad.length) {
      err(`slopscore: unknown categor${bad.length === 1 ? 'y' : 'ies'} ${bad.join(', ')}. Available: ${[...VALID_CATEGORIES].sort().join(', ')}`);
      process.exit(2);
    }
  }
}

// Severity rank (higher = worse) and the gate each --fail-on level opens.
// A run fails if any finding's rank meets or exceeds the gate.
//   --fail-on critical → only critical fails
//   --fail-on major    → critical + major fail
//   --fail-on minor    → any finding fails
//   --fail-on never    → nothing fails
const SEV_RANK = { critical: 3, major: 2, minor: 1 };
const FAIL_GATE = { critical: 3, major: 2, minor: 1, never: 4 };

function recordTrend(opts, s) {
  const prev = loadHistory(opts.history);
  const entry = {
    date: new Date().toISOString(),
    weighted: s.weighted, density: s.density,
    critical: s.counts.critical, major: s.counts.major, minor: s.counts.minor,
  };
  const runs = appendHistory(opts.history, entry);
  if (opts.format && opts.format !== 'terminal') return; // only narrate in terminal mode
  const delta = trendDelta(prev, s.weighted);
  const ascii = !report.unicodeEnabled();
  const dot = report.glyph('dot');
  out(`  trend  ${sparkline(runs.map((r) => r.weighted), ascii)}  ${s.weighted} weighted${delta ? ` ${dot} ${delta} since last run` : ''} ${dot} ${runs.length} runs`);
  out('');
}

// One scan + report. Returns whether the run should fail the gate. Does NOT exit
// (so --watch can call it in a loop). `record` appends to the score history.
const CONF_RANK = { high: 3, medium: 2, low: 1 };
function scanAndReport(opts, cfg, baseDir, failOn, record) {
  const ignore = (cfg.ignore || []).concat(opts.ignore);
  // A preset (--preset or .slopscore.json "preset") is a named bundle of per-rule
  // config; the user's explicit `rules` always wins over it.
  const preset = resolvePreset(opts.preset || cfg.preset);
  const rules = preset ? { ...preset.rules, ...(cfg.rules || {}) } : cfg.rules;
  const result = scan(opts.paths, { ignore, ignoreBase: baseDir, rules, paths: cfg.paths, customRules: cfg.customRules });
  // --min-confidence gates out softer heuristics (e.g. low-confidence 068) before
  // scoring + reporting, so CI can require only high-confidence signal.
  const floor = CONF_RANK[opts.minConfidence];
  if (floor) result.findings = result.findings.filter((f) => (CONF_RANK[f.confidence] || 3) >= floor);
  // --category focuses the run on one or more categories (e.g. a security-only audit).
  if (opts.category && opts.category.length) {
    result.findings = result.findings.filter((f) => opts.category.includes(f.category));
  }
  if (opts.baseline) {
    const existing = loadBaseline(opts.baseline);
    if (existing) {
      const known = result.findings.filter((f) => existing.has(fingerprint(f))).length;
      result.findings = result.findings.filter((f) => !existing.has(fingerprint(f)));
      result.baseline = { known, file: opts.baseline };
    }
  }
  const s = score(result);
  const emit = () => {
    if (opts.format === 'json') report.jsonReport(result, s);
    else if (opts.format === 'markdown') report.markdownReport(result, s);
    else if (opts.format === 'agent') report.agentReport(result, s);
    else if (opts.format === 'sarif') report.sarifReport(result, s);
    else if (opts.format === 'junit') report.junitReport(result, s);
    else report.terminalReport(result, s, { max: opts.max });
  };
  if (opts.out) {
    // Write the report straight to a UTF-8 file from Node, so it can't be mangled
    // into UTF-16 by a shell's `>` redirect (the Windows PowerShell failure mode).
    const buf = [];
    report.captureTo(buf);
    emit();
    report.captureTo(null);
    try {
      fs.writeFileSync(opts.out, buf.join(''), 'utf8');
    } catch (e) {
      err(`slopscore: cannot write ${opts.out}: ${e.message}`);
      process.exit(2);
    }
    out(`slopscore: wrote ${opts.format === 'terminal' ? 'report' : opts.format} to ${opts.out} (UTF-8)`);
  } else {
    emit();
  }
  if (record && opts.history) recordTrend(opts, s);
  // `--gate ship` (and the `slopscore gate` alias) reframes the run as a pre-ship
  // check: it fails only on PRODUCTION security + robustness findings at crit/major
  // ("will it break / is it safe to ship?"), and prints a ship-readiness verdict.
  if (opts.gate) return shipGate(opts, result);
  // The gate fails on PRODUCTION findings only (test/tooling is reported, not gated)
  // — and, under --baseline, only on findings new since the snapshot.
  const gate = FAIL_GATE[failOn] || FAIL_GATE.major;
  return result.findings.some((f) => f.zone !== 'test' && SEV_RANK[f.severity] >= gate);
}

// Ship-readiness gate: production security + robustness findings at crit/major are
// the "do not ship" blockers. Returns true (fail) when any exist.
function shipGate(opts, result) {
  const blockers = result.findings.filter((f) => f.zone !== 'test'
    && (f.category === 'security' || f.category === 'robustness')
    && SEV_RANK[f.severity] >= SEV_RANK.major);
  if (opts.format === 'terminal' || opts.format == null) {
    out('');
    if (blockers.length === 0) {
      out('   ' + report.glyph('check') + ' Ship-ready — no production security or robustness blockers.');
    } else {
      const bySev = { critical: 0, major: 0 };
      const ids = new Set();
      for (const f of blockers) { bySev[f.severity] += 1; ids.add(f.id); }
      out('   ' + report.glyph('times') + ` NOT ship-ready — ${blockers.length} blocker${blockers.length === 1 ? '' : 's'} `
        + `(${bySev.critical} critical, ${bySev.major} major) in security/robustness.`);
      out('   ' + `Fix these before shipping — by rule: ${[...ids].sort().join(', ')}.`);
    }
    out('');
  } else if (opts.format === 'agent') {
    out(`SHIP_GATE blockers=${blockers.length} ready=${blockers.length === 0}`);
  }
  return blockers.length > 0;
}

const WATCH_DEBOUNCE_MS = 150;
const WATCH_POLL_MS = 1500;
function runWatch(opts, cfg, baseDir, failOn) {
  const run = () => {
    process.stdout.write('\x1b[2J\x1b[H'); // clear screen, cursor home
    scanAndReport(opts, cfg, baseDir, failOn);
    out(`  ${new Date().toLocaleTimeString()} · watching for changes — Ctrl-C to stop`);
  };
  run();
  let timer = null;
  const trigger = () => { clearTimeout(timer); timer = setTimeout(run, WATCH_DEBOUNCE_MS); };
  let recursive = false;
  for (const p of opts.paths) {
    const root = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
    try { fs.watch(root, { recursive: true }, trigger); recursive = true; } catch { /* unsupported */ }
  }
  if (!recursive) setInterval(run, WATCH_POLL_MS); // platforms without recursive fs.watch (e.g. Linux)
}

function runScan(opts) {
  validateOpts(opts);
  // Color only on a real TTY (never when piped/redirected, and never into a
  // captured --out file), so a saved/piped report can't fill with ANSI codes.
  report.setColor(opts.color && !opts.out && process.stdout.isTTY === true);
  // Unicode glyphs unless the terminal can't render them. --ascii / --unicode
  // override the auto-detection. A captured --out file is always UTF-8, so it
  // keeps the full glyph set regardless of the live terminal.
  report.setUnicode(opts.unicode != null ? opts.unicode : (opts.out ? true : report.supportsUnicode()));
  for (const p of opts.paths) {
    if (!fs.existsSync(p)) { err(`slopscore: path not found: ${p}`); process.exit(2); }
  }
  const { config: cfg, baseDir } = loadConfig(configStartDir(opts.paths));
  validateConfig(cfg);
  for (const d of cfg.customRules || []) {
    if (d && d.pattern && looksReDoS(d.pattern)) {
      err(`slopscore: warning — customRule "${d.id}" skipped: pattern looks ReDoS-prone (nested quantifier "${d.pattern}"). Rewrite without a quantified group inside a quantifier.`);
    }
  }
  // --changed / --since: restrict the scan to files git reports as changed.
  if (opts.changed) {
    const changed = gitChangedFiles(opts.since);
    if (changed === null) { err('slopscore: --changed/--since needs a git repository (git not found or not a repo).'); process.exit(2); }
    const CODE = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|css|scss|sass|less|html|py|go|rb|php|rs|java|cs|kt|kts|swift|sql|sh|bash|zsh|tf|ya?ml)$|(^|[\\/])Dockerfile/i;
    const scannable = changed.filter((f) => CODE.test(f));
    if (scannable.length === 0) { out('slopscore: no changed source files to scan — clean by omission.'); process.exit(0); }
    opts.paths = scannable;
  }
  const presetName = opts.preset || cfg.preset;
  if (presetName && !resolvePreset(presetName)) {
    err(`slopscore: unknown preset "${presetName}". Available: ${presetNames().join(', ')}`);
    process.exit(2);
  }
  const failOn = opts.failOnSet ? opts.failOn : (cfg.failOn || opts.failOn);

  // Baseline snapshot is a one-shot action (write the accepted floor, then exit).
  if (opts.baseline && (opts.updateBaseline || !loadBaseline(opts.baseline))) {
    const ignore = (cfg.ignore || []).concat(opts.ignore);
    const result = scan(opts.paths, { ignore, ignoreBase: baseDir, rules: cfg.rules, paths: cfg.paths, customRules: cfg.customRules });
    const n = writeBaseline(opts.baseline, result.findings, new Date().toISOString());
    out(`slopscore: ${opts.updateBaseline ? 'updated' : 'wrote'} baseline ${opts.baseline} (${n} findings).`);
    out('Future scans with --baseline report and gate only on NEW slop.');
    process.exit(0);
  }

  if (opts.watch) { runWatch(opts, cfg, baseDir, failOn); return; }
  process.exit(scanAndReport(opts, cfg, baseDir, failOn, true) ? 1 : 0);
}

function runFix(opts) {
  validateOpts(opts);
  report.setColor(opts.color && process.stdout.isTTY === true);
  report.setUnicode(opts.unicode != null ? opts.unicode : report.supportsUnicode());
  for (const p of opts.paths) {
    if (!fs.existsSync(p)) { err(`slopscore: path not found: ${p}`); process.exit(2); }
  }
  const { config: cfg, baseDir } = loadConfig(configStartDir(opts.paths));
  const ignore = (cfg.ignore || []).concat(opts.ignore);
  const result = scan(opts.paths, { ignore, ignoreBase: baseDir, rules: cfg.rules, paths: cfg.paths, customRules: cfg.customRules });
  const plan = planFixes(result, { only: opts.only, except: opts.except });

  if (plan.length === 0) {
    out(`slopscore: nothing to auto-fix (auto rules: ${autoFixableIds().join(', ')}).`);
    const optIn = optInFixableIds();
    if (optIn.length) out(`Opt-in fixers (apply with --only): ${optIn.join(', ')}.`);
    out('Everything else is a propose/flag — run `slopscore scan` and review those by hand.');
    process.exit(0);
  }

  const arrow = report.glyph('arrow');
  let changed = 0;
  for (const file of plan) {
    out('');
    out(`  ${file.rel}`);
    for (const e of file.edits) {
      changed += 1;
      if (e.after === null) out(`    -${e.line}  [${e.id}]  ${e.before.trim()}`);
      else {
        out(`    ~${e.line}  [${e.id}]  ${e.before.trim()}`);
        out(`         ${arrow} ${e.after.trim()}`);
      }
    }
  }
  out('');
  if (opts.dryRun) {
    out(`slopscore: ${changed} fix${changed === 1 ? '' : 'es'} across ${plan.length} file${plan.length === 1 ? '' : 's'} — dry run, nothing written. Drop --dry-run to apply.`);
    process.exit(0);
  }
  applyPlan(plan);
  out(`slopscore: applied ${changed} fix${changed === 1 ? '' : 'es'} across ${plan.length} file${plan.length === 1 ? '' : 's'}. Re-scan to confirm, then review the diff before committing.`);
  process.exit(0);
}

function printProtocol() {
  const p = path.join(__dirname, '..', 'ANTI_SLOP_PROTOCOL.md');
  if (fs.existsSync(p)) out(fs.readFileSync(p, 'utf8'));
  else err('slopscore: ANTI_SLOP_PROTOCOL.md not found alongside the package.');
}

function printRules() {
  const all = LINE_RULES.concat(WHOLE_FILE_RULES, META_RULES);
  out(`slopscore ships ${all.length} deterministic detectors. The full 263-pattern catalog`);
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
  const digits = String(arg || '').replace(/[^0-9]/g, '');
  if (!digits || digits.length > 3) {
    err('slopscore: usage — slopscore explain <id>   e.g. slopscore explain 058');
    process.exit(2);
  }
  const id = digits.padStart(3, '0');
  const p = path.join(__dirname, '..', 'ANTI_SLOP_PROTOCOL.md');
  if (!fs.existsSync(p)) { err('slopscore: ANTI_SLOP_PROTOCOL.md not found alongside the package.'); process.exit(2); }
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith(`**${id} · `));
  if (start === -1) { err(`slopscore: no catalog entry ${id} (ids run 001–263). Try: slopscore protocol`); process.exit(2); }
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

function runInit() { require('../src/scaffold').runInit(); }

const HELP = `
slopscore v${pkg.version} — scan your codebase for AI slop, get a Slop Score, ship clean.

USAGE
  slopscore [scan] [paths...] [options]
  slopscore fix [paths...]      auto-apply the safe (🟢 AUTO) fixes; --dry-run to preview
  slopscore gate [paths...]     pre-ship gate: fail on production security + robustness crit/major
  slopscore doctor              diagnose config, ignored paths, stale suppressions, detector count
  slopscore protocol            print the full 263-pattern protocol (pipe to your agent)
  slopscore rules               list the deterministic detectors this CLI runs
  slopscore explain <id>        print one catalog pattern + its fix (e.g. explain 058)
  slopscore init                scaffold .slopscore.json + a PR gate + AGENTS.md (agent auto-adoption)

OPTIONS
  --json                     machine-readable findings + score
  --markdown                 a Markdown report (great for PR comments)
  --sarif                    SARIF 2.1.0 (GitHub code-scanning annotations)
  --format junit             JUnit XML (CI test-report panels)
  --format agent             compact output for feeding an AI agent
  --fail-on <level>          exit non-zero at: critical | major | minor | never  (default: major)
  --min-confidence <level>   only report/score findings at: high | medium | low  (default: low/all)
  --category <names>         focus on one or more categories, e.g. security  (comma-separated)
  --changed                  scan only files git reports as changed (staged/unstaged/untracked)
  --since <ref>              scan only files changed since a git ref (e.g. origin/main)
  --preset <name>            tune coverage to the project: library | backend | cli |
                             web | marketing | mui | tailwind | chakra | …  (also: "preset" in config)
  --baseline [file]          ratchet mode: snapshot current findings, then fail only
                             on NEW slop (default file: .slopscore-baseline.json)
  --update-baseline          re-snapshot the baseline (accept the current findings)
  --history [file]           record the score over time + show a trend sparkline
                             (default file: .slopscore-history.json)
  --max <n>                  max findings to print in the terminal     (default: 40)
  --ignore <path>            extra path to ignore (repeatable)
  --out <file>               write the report to a UTF-8 file (avoids shell-redirect
                             encoding issues, e.g. PowerShell's UTF-16 redirect)
  --watch, -w                re-scan on every file change (live local conscience)
  --no-color                 disable ANSI color
  --ascii                    ASCII-only glyphs (auto-enabled on legacy Windows consoles)
  --unicode                  force Unicode glyphs (override the auto-detection)

FIX OPTIONS (slopscore fix)
  --dry-run, -n              preview the fixes without writing any file
  --only <ids>               fix only these rule ids (comma-separated)
  --except <ids>             fix everything fixable except these ids

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
  // Emit UTF-8 bytes regardless of the platform default (matters on Windows).
  if (process.stdout.setDefaultEncoding) try { process.stdout.setDefaultEncoding('utf8'); } catch { /* non-fatal */ }
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === '--version' || cmd === '-v') { out(pkg.version); return; }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') { out(HELP); return; }
  if (cmd === 'protocol') { printProtocol(); return; }
  if (cmd === 'rules') { printRules(); return; }
  if (cmd === 'explain') { printExplain(argv[1]); return; }
  if (cmd === 'init') { runInit(); return; }
  if (cmd === 'fix') { runFix(parseArgs(argv.slice(1))); return; }
  if (cmd === 'gate') { const o = parseArgs(argv.slice(1)); o.gate = o.gate || 'ship'; runScan(o); return; }
  if (cmd === 'doctor') { runDoctor(argv.slice(1)); return; }
  const rest = cmd === 'scan' ? argv.slice(1) : argv;
  runScan(parseArgs(rest));
}

main();
