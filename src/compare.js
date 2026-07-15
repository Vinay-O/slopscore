'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { scan } = require('./scanner');
const { score } = require('./score');
const { fingerprint } = require('./baseline');
const { loadConfig, configStartDir } = require('./config');
const { resolvePreset } = require('./presets');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Build the scan options for one root, honoring .slopscore.json + preset + --ast.
function scanOptsFor(root, cfg, opts) {
  const preset = resolvePreset(opts.preset || cfg.preset);
  const rules = preset ? { ...preset.rules, ...(cfg.rules || {}) } : cfg.rules;
  return { ignore: cfg.ignore || [], ignoreBase: root, rules, paths: cfg.paths, customRules: cfg.customRules, ast: opts.ast };
}

const SEV_ORDER = { critical: 0, major: 1, minor: 2 };

// `slopscore compare [ref]` — diff the Slop Score and findings between the working
// tree and a git ref (default HEAD). Non-destructive: the ref is scanned in a
// throwaway `git worktree`, so the working tree is never touched. Returns
// { code, lines } — lines are pre-formatted for stdout (no color coupling).
function runCompare(argv, parseArgs) {
  const opts = parseArgs(argv.filter((a) => a[0] === '-'));
  const positional = argv.filter((a) => a[0] !== '-');
  const ref = positional[0] || 'HEAD';
  const cwd = process.cwd();
  const isGit = (() => { try { git(['rev-parse', '--is-inside-work-tree'], cwd); return true; } catch { return false; } })();
  if (!isGit) return { code: 2, lines: ["compare: not inside a git repository (compare needs git to read the ref's tree)."] };
  let sha;
  try { sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd); }
  catch { return { code: 2, lines: [`compare: '${ref}' is not a valid git ref.`] }; }

  const { config: cfg, baseDir } = loadConfig(configStartDir([cwd]));

  // Scan the working tree now (root = repo/config base -> repo-relative paths).
  const now = scan([baseDir], scanOptsFor(baseDir, cfg, opts));
  const sNow = score(now);

  // Scan the ref in a throwaway detached worktree.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slopscore-cmp-'));
  let refResult;
  const cleanup = () => {
    try { git(['worktree', 'remove', '--force', tmp], cwd); } catch { /* ignore */ }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  try {
    git(['worktree', 'add', '--detach', '--quiet', tmp, sha], cwd);
    refResult = scan([tmp], scanOptsFor(tmp, cfg, opts));
  } catch (e) {
    cleanup();
    return { code: 2, lines: [`compare: could not check out '${ref}' (${((e && e.message) || 'worktree failed').split('\n')[0]}).`] };
  }
  cleanup();
  const sRef = score(refResult);

  // Diff by content fingerprint (line-number-independent, like the baseline).
  const nowFp = new Map(now.findings.map((f) => [fingerprint(f), f]));
  const refFp = new Map(refResult.findings.map((f) => [fingerprint(f), f]));
  const added = [...nowFp].filter(([k]) => !refFp.has(k)).map(([, f]) => f);
  const removed = [...refFp].filter(([k]) => !nowFp.has(k)).map(([, f]) => f);
  const bySev = (a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || a.file.localeCompare(b.file);
  added.sort(bySev); removed.sort(bySev);

  const delta = sNow.weighted - sRef.weighted;
  const arrow = delta > 0 ? 'up' : delta < 0 ? 'down' : '=';
  const sign = delta > 0 ? '+' : '';
  const cap = 25;
  const lines = [
    '',
    `  slopscore compare  ·  working tree  vs  ${ref} (${sha.slice(0, 8)})`,
    '',
    `  score:  ${sRef.weighted}  ->  ${sNow.weighted} weighted   ${arrow} ${sign}${delta}`,
    `  ${ref}:  ${sRef.counts.critical} crit · ${sRef.counts.major} major · ${sRef.counts.minor} minor`,
    `  now:  ${sNow.counts.critical} crit · ${sNow.counts.major} major · ${sNow.counts.minor} minor`,
    '',
  ];
  if (added.length) {
    lines.push(`  + ${added.length} new finding${added.length === 1 ? '' : 's'} introduced:`);
    for (const f of added.slice(0, cap)) lines.push(`      + ${f.severity.toUpperCase().padEnd(8)} [${f.id}] ${f.file}:${f.line}  ${f.title}`);
    if (added.length > cap) lines.push(`      ... and ${added.length - cap} more`);
    lines.push('');
  }
  if (removed.length) {
    lines.push(`  - ${removed.length} finding${removed.length === 1 ? '' : 's'} fixed:`);
    for (const f of removed.slice(0, cap)) lines.push(`      - ${f.severity.toUpperCase().padEnd(8)} [${f.id}] ${f.file}:${f.line}  ${f.title}`);
    if (removed.length > cap) lines.push(`      ... and ${removed.length - cap} more`);
    lines.push('');
  }
  if (!added.length && !removed.length) lines.push('  No change in findings.');
  lines.push(delta > 0 ? '  > This introduces slop. Review the new findings above.'
    : delta < 0 ? '  > Net improvement. Nice.'
      : '  > Slop Score unchanged.');
  lines.push('');

  // Exit non-zero when the change introduces slop (useful as a PR gate).
  return { code: delta > 0 ? 1 : 0, lines };
}

module.exports = { runCompare };
