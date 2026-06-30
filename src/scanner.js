'use strict';

const fs = require('fs');
const path = require('path');
const { LINE_RULES, WHOLE_FILE_RULES, META, confidenceOf } = require('./rules');
const { checkDuplication, CODE_FOR_DUP } = require('./duplication');
const { buildSuppressions, buildEslintSuppressions } = require('./suppress');
const { commentMask } = require('./mask');

// id → { eslint, category } so an applied finding can be matched against an
// inline `eslint-disable` directive. Security findings are never eslint-suppressible
// (the whole point is to catch a hole the dev waved through), so they carry no map.
const ESLINT_BY_ID = new Map();
for (const r of [...LINE_RULES, ...WHOLE_FILE_RULES]) {
  if (r.eslint && r.category !== 'security') ESLINT_BY_ID.set(r.id, r.eslint);
}

// Rules that detect a CODE construct (a call, an operator, a keyword): a match
// inside a string literal or comment/docstring is always prose, never a real use,
// so these only fire in actual code. (SQL/secret/model-string rules are NOT here —
// their whole point is to match a string's contents.)
const CODE_ONLY_IDS = new Set(['052', '106', '144', '152', '153', '155', '159', '172', '178', '179', '180', '181']);
// 057 (TODO/FIXME) is the inverse: a debt marker lives in a comment, while a `TODO`
// data value / enum case does not — so it must match ONLY inside comments.
const COMMENTS_ONLY_IDS = new Set(['057']);
for (const r of LINE_RULES) {
  if (CODE_ONLY_IDS.has(r.id)) r.codeOnly = true;
  if (COMMENTS_ONLY_IDS.has(r.id)) r.commentsOnly = true;
}

// Build a finding from a META catalog entry, allowing the bespoke check to
// override the display title (e.g. to include a live line/dependency count) and
// the severity (god files escalate critical past a threshold). Keeps the fix
// text, category, and authority in one place — src/rules.js.
function metaFinding(id, file, { title, severity, snippet, line = 1 } = {}) {
  const m = META[id];
  return {
    id, category: m.category, authority: m.authority, fix: m.fix,
    title: title || m.title, severity: severity || m.severity,
    confidence: confidenceOf(m),
    file, line, snippet: snippet || m.title,
  };
}

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '.svelte-kit', 'vendor', '.venv', 'venv', '__pycache__', '.cache', 'public/build',
];
const TEXT_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.css', '.scss',
  '.sass', '.less', '.html', '.py', '.go', '.rb', '.php', '.rs',
]);
// Test files across ecosystems — JS (.test./.spec./__tests__/.stories./.cy.),
// pytest (test_*.py, *_test.py, conftest.py), Go (*_test.go), Ruby (*_test.rb,
// *_spec.rb). Used both to gate skipTests rules and (via zoneOf) the score zone.
const TEST_RE = /(\.test\.|\.spec\.|__tests__|\.stories\.|\.cy\.|(^|[\\/])test_[^\\/]*\.py$|[^\\/]*_test\.(py|go|rb)$|[^\\/]*_spec\.rb$|(^|[\\/])conftest\.py$)/;
const MAX_BYTES = 2 * 1024 * 1024;
const GOD_FILE_LINES = 500;
const DEP_BUDGET = 80;
const THIN_README_LINES = 20;
const SEVERITIES = new Set(['critical', 'major', 'minor']);

// Generated / vendored / minified files are not the author's code — scanning them
// is pure noise (a minified bundle is full of "empty catches" and "any"). Skip them.
const GENERATED_NAME = /(\.min\.(js|mjs|cjs|css)|\.bundle\.(js|mjs|cjs)|\.generated\.|\.gen\.|-lock\.|\.map)$/i;
function looksGenerated(file, lines) {
  if (GENERATED_NAME.test(path.basename(file))) return true;
  if (lines.some((l) => l.length > 3000)) return true; // minified: enormous single lines
  return /@generated|DO NOT EDIT|auto-?generated|this file is (auto-?)?generated/i.test(lines.slice(0, 5).join('\n'));
}

// Non-production zones: test, tooling, scripts. Findings here are real but carry
// far less production risk (controlled inputs, never shipped), so they're reported
// separately and don't inflate the headline Slop Score. Note: examples/ is treated
// as production (sample code people copy) — only clearly non-shipped paths qualify.
const NONPROD_PATH = /(^|[\\/])(tests?|specs?|e2e|__tests__|__mocks__|fixtures?|mocks?|cypress|\.storybook|scripts?|tooling|benchmarks?|bench|audit)([\\/]|$)/i;
const NONPROD_FILE = /\.(test|spec|stories|cy|e2e|bench)\.[a-z]+$/i;
function zoneOf(file) {
  return (NONPROD_PATH.test(file) || NONPROD_FILE.test(file) || TEST_RE.test(file)) ? 'test' : 'production';
}

// Project-level context computed before scanning, so cross-file facts can suppress
// per-line false positives. CSS is global: if the project defines a `:focus-visible`
// style anywhere (a global reset), `outline:none` elsewhere isn't removing the focus
// indicator — so rule 083 shouldn't fire repo-wide. Cheap: only reads style files.
const STYLE_EXT = new Set(['.css', '.scss', '.sass', '.less', '.styl']);
function detectGlobalContext(files) {
  const ctx = { hasGlobalFocusVisible: false };
  for (const file of files) {
    if (ctx.hasGlobalFocusVisible) break;
    if (!STYLE_EXT.has(path.extname(file))) continue;
    try {
      if (fs.statSync(file).size > MAX_BYTES) continue;
      if (/:focus-visible/.test(fs.readFileSync(file, 'utf8'))) ctx.hasGlobalFocusVisible = true;
    } catch { /* unreadable — ignore */ }
  }
  return ctx;
}

// Two kinds of ignore entry: a bare segment ("node_modules", "examples") matches
// any path component with that name; a path with a separator ("src/rules.js")
// resolves to an absolute location against `base` (the .slopscore.json dir), so a
// configured ignore is honored from any scan root.
function normalizeIgnore(ignore, base) {
  const segments = [];
  const paths = [];
  for (const ig of ignore) {
    if (!ig) continue;
    if (ig.includes('/') || ig.includes('\\')) paths.push(path.resolve(base, ig));
    else segments.push(ig);
  }
  return { segments, paths };
}

// `rel` is the path relative to the scan root; segment matching uses it so an
// ancestor directory named like an ignore segment (e.g. a checkout living under
// ~/build/) doesn't silently ignore the whole project. Path ignores still match
// the absolute path.
function isIgnored(full, rel, norm) {
  const parts = rel.split(path.sep);
  if (norm.segments.some((seg) => parts.includes(seg))) return true;
  return norm.paths.some((p) => full === p || full.startsWith(p + path.sep));
}

function walk(root, norm) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (isIgnored(full, path.relative(root, full), norm)) continue;
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && TEXT_EXTS.has(path.extname(entry.name))) {
        files.push(full);
      }
    }
  }
  return files.sort();
}


// Build a finding from a matched rule (shared by line and whole-file scanning).
function ruleFinding(rule, file, line, snippet) {
  return {
    id: rule.id, title: rule.title, category: rule.category, severity: rule.severity,
    authority: rule.authority, confidence: confidenceOf(rule), fix: rule.fix, file, line, snippet,
  };
}

function ruleAppliesToFile(rule, ext) {
  return rule.exts === null || rule.exts === undefined || rule.exts.includes(ext);
}

function scanLineRules(file, ext, isTest, text, lines, mask, findings, project) {
  // Decide which rules apply to this file once, not per line.
  //  - unlessFileContains: the whole file proves it's handled (same-file focus-visible).
  //  - unlessProject: a project-wide fact suppresses it (a global :focus-visible reset).
  const active = LINE_RULES.filter((rule) => ruleAppliesToFile(rule, ext)
    && !(rule.skipTests && isTest)
    && !(rule.unlessFile && rule.unlessFile.test(file))
    && !(rule.unlessFileContains && rule.unlessFileContains.test(text))
    && !(rule.unlessProject && project && project[rule.unlessProject]));
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n];
    for (const rule of active) {
      if (rule.unless && rule.unless.test(line)) continue;
      // Find the first match in an ACCEPTABLE zone. codeOnly → must be code (not a
      // comment or string). respectComments → must not be a comment. commentsOnly →
      // must be inside a comment (e.g. a TODO marker, not a `TODO` data value).
      const re = globalRe(rule);
      re.lastIndex = 0;
      let m; let hit = null;
      while ((m = re.exec(line)) !== null) {
        const k = mask[n][m.index] || 0;
        const ok = rule.commentsOnly ? k === 1
          : rule.codeOnly ? k === 0
            : !(rule.respectComments && k === 1);
        if (ok) { hit = m; break; }
        if (m.index === re.lastIndex) re.lastIndex += 1;
      }
      if (hit) findings.push(ruleFinding(rule, file, n + 1, line.trim().slice(0, 120)));
    }
  }
}

// A cached global clone of a rule's regex, so we can scan past a match that landed
// in a comment/string to a later acceptable one (the first match isn't always it).
function globalRe(rule) {
  if (!rule._g) rule._g = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`);
  return rule._g;
}

// 1-based line number for a character offset, via binary search over the
// precomputed line-start offsets — O(log n) per match. (Re-slicing the whole
// file per match was O(n) each, i.e. O(n²) on a match-dense file → DoS.)
function lineNoAt(lineStarts, index) {
  let lo = 0; let hi = lineStarts.length - 1; let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= index) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans + 1;
}

function scanWholeFileRules(file, ext, isTest, text, lines, findings) {
  const applicable = WHOLE_FILE_RULES.filter((rule) => ruleAppliesToFile(rule, ext) && !(rule.skipTests && isTest));
  if (applicable.length === 0) return;
  // Precompute each line's starting char offset ONCE; reuse for every match.
  const lineStarts = new Array(lines.length);
  let off = 0;
  for (let i = 0; i < lines.length; i += 1) { lineStarts[i] = off; off += lines[i].length + 1; }
  for (const rule of applicable) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`);
    let m;
    while ((m = re.exec(text)) !== null) {
      const lineNo = lineNoAt(lineStarts, m.index);
      findings.push(ruleFinding(rule, file, lineNo, (lines[lineNo - 1] || '').trim().slice(0, 120)));
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
}

// Count top-level "responsibilities" — function/class/exported declarations. A
// large file with FEW units (a registry, one cohesive class, a generated table)
// is not a god file; a large file with MANY is. This is the cohesion signal that
// keeps slopscore from calling a 2,000-line lookup table "slop".
function countTopLevelUnits(lines, ext) {
  const re = ext === '.py'
    ? /^(async\s+def|def|class)\s+\w/
    : /^(export\s+)?(default\s+)?(async\s+)?(function\s+\w|class\s+\w|interface\s+\w|enum\s+\w|const\s+\w+\s*=\s*(async\s*)?(\([^)]*\)|\w+)\s*=>)/;
  let n = 0;
  for (const l of lines) if (re.test(l)) n += 1;
  return n;
}

function checkFileSize(file, ext, isTest, lineCount, lines, findings) {
  const CODE_LIKE = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rb', '.php', '.vue', '.svelte'];
  if (isTest || !CODE_LIKE.includes(ext) || lineCount <= GOD_FILE_LINES) return;
  // Only flag when the file is also SPRAWLING (many separate responsibilities).
  if (countTopLevelUnits(lines, ext) < 8) return;
  // A god file is a maintainability smell on a line-count heuristic — never the
  // most-severe class. Cap at major (a huge one is still just major), so the
  // severity stays consistent with the medium confidence we report.
  findings.push(godFinding(file, lineCount, 'major'));
}

function godFinding(file, count, severity) {
  return metaFinding('055', file, {
    title: `God file (${count} lines)`, severity, snippet: `${count} lines in one file`,
  });
}

function checkVersionedDuplicates(files, findings) {
  const re = /(_v\d+|_old|_backup|_copy|_final|_updated| \d+)\.[a-z]+$/i;
  for (const file of files) {
    if (re.test(path.basename(file))) {
      findings.push(metaFinding('061', file, { snippet: path.basename(file) }));
    }
  }
}

function checkRepoLevel(root, findings) {
  checkTrackedEnv(root, findings);
  checkDependencyBudget(root, findings);
  checkThinReadme(root, findings);
}

// Detect a committed .env WITHOUT running git: a crafted .git/config can make git
// execute arbitrary commands inside a scanned dir, breaking the read-only
// guarantee. A real .env (not .env.example) in the root and not matched by a
// .gitignore rule is the committed-secret risk this catches.
function checkTrackedEnv(root, findings) {
  let entries;
  try { entries = fs.readdirSync(root); } catch { return; }
  const envFiles = entries.filter((f) => /^\.env($|\.)/.test(f) && !/\.example$/.test(f));
  if (envFiles.length === 0) return;
  let gitignore = '';
  try { gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8'); } catch { /* none */ }
  const envIgnored = /^\s*!?\s*\*?\.env\b/m.test(gitignore) || /^\s*\.env\*/m.test(gitignore);
  if (envIgnored) return; // dev intends it untracked — not a committed secret
  for (const f of envFiles) {
    findings.push(metaFinding('107', path.join(root, f), { snippet: f }));
  }
}

function checkDependencyBudget(root, findings) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const count = Object.keys(pkg.dependencies || {}).length;
    if (count > DEP_BUDGET) {
      findings.push(metaFinding('079', pkgPath, {
        title: `Dependency bloat (${count} runtime deps)`, snippet: `${count} runtime dependencies`,
      }));
    }
  } catch {
    /* malformed package.json — not this scanner's job to repair it */
  }
}

function checkThinReadme(root, findings) {
  const candidates = ['README.md', 'readme.md', 'Readme.md'];
  const found = candidates.map((c) => path.join(root, c)).find((p) => fs.existsSync(p));
  if (!found) return;
  const lineCount = fs.readFileSync(found, 'utf8').split('\n').filter((l) => l.trim()).length;
  if (lineCount < THIN_README_LINES) {
    findings.push(metaFinding('080', found, { snippet: `${lineCount} non-empty lines` }));
  }
}

function gatherFiles(roots, norm) {
  const files = new Set();
  let hasDir = false;
  for (const root of roots) {
    const resolved = path.resolve(root);
    let stat;
    try { stat = fs.statSync(resolved); } catch { continue; }
    if (stat.isFile()) {
      // An explicitly-named file is always scanned — ignore rules govern
      // directory *walking* (auto-discovery), not a target the user points at.
      files.add(resolved);
    } else if (stat.isDirectory()) {
      hasDir = true;
      for (const f of walk(resolved, norm)) files.add(f);
    }
  }
  return { files: Array.from(files).sort(), hasDir };
}

// `ignoreBase` is the directory configured ignore *paths* resolve against —
// normally the directory holding .slopscore.json (the repo root). Defaults to the
// single directory root being scanned, else the current working directory.
function defaultIgnoreBase(roots) {
  if (roots.length === 1 && safeIsDir(roots[0])) return path.resolve(roots[0]);
  return process.cwd();
}

/**
 * @typedef {Object} Finding
 * @property {string} id        Catalog id — maps to an entry in ANTI_SLOP_PROTOCOL.md.
 * @property {string} title
 * @property {string} category
 * @property {'critical'|'major'|'minor'} severity
 * @property {'auto'|'propose'|'flag'} authority
 * @property {string} fix
 * @property {string} file      Path relative to the scan root.
 * @property {number} line      1-based line number.
 * @property {string} snippet
 */

/**
 * @typedef {Object} ScanResult
 * @property {Finding[]} findings
 * @property {number} fileCount
 * @property {number} totalLines
 */

/**
 * Scan one or more files/directories for AI-slop patterns.
 * @param {string|string[]} target One or more file or directory paths.
 * @param {{ignore?: string[], ignoreBase?: string, repoRoot?: string, skipRepoChecks?: boolean}} [options]
 *   `ignore` adds paths/segments to skip; `ignoreBase` is the directory that
 *   configured ignore *paths* resolve against (normally the .slopscore.json dir).
 * @returns {ScanResult}
 */
function scan(target, options = {}) {
  const roots = Array.isArray(target) ? target : [target];
  const base = options.ignoreBase ? path.resolve(options.ignoreBase) : defaultIgnoreBase(roots);
  const norm = normalizeIgnore(DEFAULT_IGNORE.concat(options.ignore || []), base);
  const { files, hasDir } = gatherFiles(roots, norm);
  const findings = [];

  const project = detectGlobalContext(files);
  const codeFiles = [];
  let totalLines = 0;
  let productionLines = 0;
  let suppressed = 0;
  const staleSuppressions = [];
  for (const file of files) {
    let text;
    try {
      if (fs.statSync(file).size > MAX_BYTES) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue; // binary guard
    const ext = path.extname(file);
    const lines = text.split('\n');
    if (looksGenerated(file, lines)) continue; // skip minified/vendored/generated noise
    const isTest = TEST_RE.test(file);
    const zone = zoneOf(file);
    // A trailing newline yields a final empty element — don't count it as a line.
    const lineCount = lines.length - (lines.length && lines[lines.length - 1] === '' ? 1 : 0);
    totalLines += lineCount;
    if (zone === 'production') productionLines += lineCount;
    if (CODE_FOR_DUP.has(ext)) codeFiles.push({ file, lines, zone });
    const mask = commentMask(lines, ext);
    const before = findings.length;
    scanLineRules(file, ext, isTest, text, lines, mask, findings, project);
    scanWholeFileRules(file, ext, isTest, text, lines, findings);
    checkFileSize(file, ext, isTest, lineCount, lines, findings);
    // Apply inline suppressions and tag the zone on this file's findings.
    const { map: suppress, directives } = buildSuppressions(lines);
    const eslintSup = buildEslintSuppressions(lines);
    const usedTargets = new Set();
    const fresh = findings.splice(before);
    for (const f of fresh) {
      const sup = suppress[f.line - 1];
      if (sup === true || (sup && sup.has(f.id))) { suppressed += 1; usedTargets.add(f.line - 1); continue; }
      // Honor an inline `eslint-disable` for the matching (non-security) rule —
      // a finding the project already, deliberately, signed off on via ESLint.
      const esl = eslintSup[f.line - 1];
      const eslName = ESLINT_BY_ID.get(f.id);
      // eslName guards security: a finding with no eslint mapping (every security
      // rule) is never silenced, not even by a bare `eslint-disable` (all-rules).
      if (eslName && (esl === true || (esl && esl.has(eslName)))) { suppressed += 1; continue; }
      f.zone = zone;
      findings.push(f);
    }
    // A directive that suppressed nothing is stale — the finding it hid is gone.
    for (const d of directives) {
      if (!usedTargets.has(d.target)) {
        staleSuppressions.push({ file, line: d.line + 1, ids: d.ids });
      }
    }
  }

  checkVersionedDuplicates(files, findings);
  if (!options.skipDuplication) checkDuplication(codeFiles, findings, metaFinding);
  const repoRoot = path.resolve(options.repoRoot || (hasDir ? roots.find((r) => safeIsDir(r)) : null) || '.');
  if (hasDir && fs.existsSync(repoRoot) && !options.skipRepoChecks) checkRepoLevel(repoRoot, findings);
  // Repo-level findings (.env, dep bloat, thin README, dup files) are production by default.
  for (const f of findings) if (!f.zone) f.zone = 'production';

  // Config overrides:
  //   "rules":  { "054": false, "099": "minor" }           — global per-rule
  //   "paths":  { "legacy/": { "054": false, "*": "minor" } } — per-directory
  // A `false`/`"off"` disables; a severity string re-rates. `"*"` targets all rules.
  // Per-path wins over global; first matching path key applies.
  const ruleCfg = options.rules || {};
  const pathCfg = options.paths || {};
  const pathKeys = Object.keys(pathCfg);
  const apply = (over, f) => {
    if (over === false || over === 'off') return false;
    if (typeof over === 'string' && SEVERITIES.has(over)) f.severity = over;
    return true;
  };
  let effective = findings;
  if (Object.keys(ruleCfg).length || pathKeys.length) {
    effective = findings.filter((f) => {
      if (apply(ruleCfg[f.id], f) === false) return false;
      for (const key of pathKeys) {
        if (!f.file.includes(key)) continue;
        const over = key in pathCfg && pathCfg[key]['*'] !== undefined ? pathCfg[key]['*'] : pathCfg[key][f.id];
        if (apply(over, f) === false) return false;
      }
      return true;
    });
  }

  const displayRoot = roots.length === 1 ? path.resolve(roots[0]) : process.cwd();
  const baseDir = safeIsDir(displayRoot) ? displayRoot : path.dirname(displayRoot);
  for (const f of effective) f.file = path.relative(baseDir, f.file) || path.basename(f.file);
  for (const s of staleSuppressions) s.file = path.relative(baseDir, s.file) || path.basename(s.file);
  return {
    findings: effective, fileCount: files.length, totalLines, productionLines,
    suppressed, staleSuppressions, baseDir,
  };
}

function safeIsDir(p) {
  try { return fs.statSync(path.resolve(p)).isDirectory(); } catch { return false; }
}

module.exports = { scan, walk };
