'use strict';

const fs = require('fs');
const path = require('path');
const { LINE_RULES, WHOLE_FILE_RULES, META } = require('./rules');

// Build a finding from a META catalog entry, allowing the bespoke check to
// override the display title (e.g. to include a live line/dependency count) and
// the severity (god files escalate critical past a threshold). Keeps the fix
// text, category, and authority in one place — src/rules.js.
function metaFinding(id, file, { title, severity, snippet, line = 1 } = {}) {
  const m = META[id];
  return {
    id, category: m.category, authority: m.authority, fix: m.fix,
    title: title || m.title, severity: severity || m.severity,
    file, line, snippet: snippet || m.title,
  };
}

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '.svelte-kit', 'vendor', '.venv', 'venv', '__pycache__', '.cache', 'public/build',
];
const TEXT_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.css', '.scss',
  '.sass', '.less', '.html', '.py', '.go', '.rb', '.php',
]);
const TEST_RE = /(\.test\.|\.spec\.|__tests__|\.stories\.|\.cy\.)/;
const MAX_BYTES = 2 * 1024 * 1024;
const GOD_FILE_LINES = 500;
const HUGE_FILE_LINES = 800;
const DEP_BUDGET = 80;
const THIN_README_LINES = 20;

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
  return (NONPROD_PATH.test(file) || NONPROD_FILE.test(file)) ? 'test' : 'production';
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

// Positions where a `/` begins a regex literal rather than division — i.e. where
// a value is expected. Heuristic (covers the real cases); not a full JS lexer.
const REGEX_OK = new Set(['', '(', ',', '=', ':', '[', '{', ';', '!', '&', '|', '?', '+', '-', '*', '%', '<', '>', '~', '^']);

// Mark character positions inside // or /* */ comments. String- and regex-literal-
// aware: a `//` inside "http://..." or /https:\/\// isn't a comment, and a quote
// inside a regex doesn't open a string — so real detections aren't wrongly hidden.
// Block comments span lines; string/regex state resets each line (the safe way).
function commentMask(lines) {
  const mask = [];
  let inBlock = false;
  for (const line of lines) {
    const flags = new Array(line.length).fill(false);
    let i = 0;
    let inStr = null;   // active quote char (' " `), or null
    let prevSig = '';   // last significant (non-space) char seen
    while (i < line.length) {
      const ch = line[i];
      if (inBlock) {
        flags[i] = true;
        if (ch === '*' && line[i + 1] === '/') { flags[i + 1] = true; inBlock = false; i += 2; prevSig = '/'; continue; }
        i += 1; continue;
      }
      if (inStr) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === inStr) { inStr = null; prevSig = ch; i += 1; continue; }
        i += 1; continue;
      }
      if (ch === ' ' || ch === '\t') { i += 1; continue; } // whitespace doesn't change prevSig
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; prevSig = ch; i += 1; continue; }
      if (ch === '/' && line[i + 1] === '/') { for (let j = i; j < line.length; j += 1) flags[j] = true; break; }
      if (ch === '/' && line[i + 1] === '*') { flags[i] = flags[i + 1] = true; inBlock = true; i += 2; continue; }
      if (ch === '/' && REGEX_OK.has(prevSig)) {
        // Skip a regex literal: advance to the closing unescaped '/' that isn't
        // inside a [character class]. If none on this line, treat '/' as division.
        let j = i + 1; let inClass = false; let closed = false;
        while (j < line.length) {
          const c = line[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) { closed = true; j += 1; break; }
          j += 1;
        }
        if (closed) { i = j; prevSig = '/'; continue; }
        prevSig = '/'; i += 1; continue;
      }
      prevSig = ch; i += 1;
    }
    mask.push(flags);
  }
  return mask;
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
      const m = rule.re.exec(line);
      if (!m) continue;
      if (rule.respectComments && mask[n][m.index]) continue;
      findings.push({
        id: rule.id, title: rule.title, category: rule.category, severity: rule.severity,
        authority: rule.authority, fix: rule.fix, file, line: n + 1,
        snippet: line.trim().slice(0, 120),
      });
    }
  }
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
      findings.push({
        id: rule.id, title: rule.title, category: rule.category, severity: rule.severity,
        authority: rule.authority, fix: rule.fix, file, line: lineNo,
        snippet: (lines[lineNo - 1] || '').trim().slice(0, 120),
      });
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
}

function checkFileSize(file, ext, isTest, lineCount, findings) {
  const CODE_LIKE = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rb', '.php', '.vue', '.svelte'];
  if (isTest || !CODE_LIKE.includes(ext)) return;
  if (lineCount > HUGE_FILE_LINES) {
    findings.push(godFinding(file, lineCount, 'critical'));
  } else if (lineCount > GOD_FILE_LINES) {
    findings.push(godFinding(file, lineCount, 'major'));
  }
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
  let totalLines = 0;
  let productionLines = 0;
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
    const mask = commentMask(lines);
    const before = findings.length;
    scanLineRules(file, ext, isTest, text, lines, mask, findings, project);
    scanWholeFileRules(file, ext, isTest, text, lines, findings);
    checkFileSize(file, ext, isTest, lineCount, findings);
    for (let i = before; i < findings.length; i += 1) findings[i].zone = zone;
  }

  checkVersionedDuplicates(files, findings);
  const repoRoot = path.resolve(options.repoRoot || (hasDir ? roots.find((r) => safeIsDir(r)) : null) || '.');
  if (hasDir && fs.existsSync(repoRoot) && !options.skipRepoChecks) checkRepoLevel(repoRoot, findings);
  // Repo-level findings (.env, dep bloat, thin README, dup files) are production by default.
  for (const f of findings) if (!f.zone) f.zone = 'production';

  const displayRoot = roots.length === 1 ? path.resolve(roots[0]) : process.cwd();
  const baseDir = safeIsDir(displayRoot) ? displayRoot : path.dirname(displayRoot);
  for (const f of findings) f.file = path.relative(baseDir, f.file) || path.basename(f.file);
  return { findings, fileCount: files.length, totalLines, productionLines };
}

function safeIsDir(p) {
  try { return fs.statSync(path.resolve(p)).isDirectory(); } catch { return false; }
}

module.exports = { scan, walk };
