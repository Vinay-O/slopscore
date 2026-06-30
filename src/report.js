'use strict';

const pkg = require('../package.json');

// Output goes to stdout by default, but can be captured (e.g. so `--out file`
// writes a UTF-8 file directly, sidestepping PowerShell's UTF-16 `>` redirect).
let sink = null;
const out = (s) => { if (sink) sink(s + '\n'); else process.stdout.write(s + '\n'); };
const captureTo = (arr) => { sink = arr ? (s) => arr.push(s) : null; };

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', gray: '\x1b[90m',
};
let useColor = true;
const paint = (code, s) => (useColor ? code + s + C.reset : s);
const setColor = (on) => { useColor = on; };

// Many Windows consoles (legacy cmd/PowerShell on a non-UTF-8 code page) render
// emoji and box-drawing as mojibake. When Unicode isn't safe, every glyph falls
// back to an ASCII equivalent. Detection mirrors the well-known is-unicode-supported
// heuristic: non-Windows is fine; on Windows, only modern hosts (Windows Terminal,
// VS Code, ConEmu, CI) are trusted.
function supportsUnicode() {
  if (process.platform !== 'win32') return true;
  return Boolean(
    process.env.CI
    || process.env.WT_SESSION
    || process.env.TERMINUS_SUBLIME
    || process.env.ConEmuTask === '{cmd::Cmder}'
    || process.env.TERM_PROGRAM === 'vscode'
    || process.env.TERM === 'xterm-256color'
    || process.env.TERM === 'alacritty',
  );
}
let useUnicode = true;
const setUnicode = (on) => { useUnicode = on; };
// [unicode, ascii] for each glyph the terminal report draws.
const GLYPH = {
  tl: ['╔', '+'], tr: ['╗', '+'], bl: ['╚', '+'], br: ['╝', '+'], h: ['═', '='], v: ['║', '|'],
  arrow: ['▶', '>'], check: ['✓', '*'], dot: ['·', '-'], ellipsis: ['…', '...'],
  red: ['🔴', '[X]'], orange: ['🟠', '[!]'], yellow: ['🟡', '[-]'], green: ['🟢', '[+]'],
};
const g = (k) => GLYPH[k][useUnicode ? 0 : 1];

const SEV_COLOR = { critical: C.red, major: C.yellow, minor: C.gray };
const sevLabel = (sev) => (
  sev === 'critical' ? `${g('red')} CRIT`
    : sev === 'major' ? `${g('orange')} MAJOR`
      : `${g('yellow')} MINOR`
);
const SEV_TAG = { critical: 'CRIT', major: 'MAJOR', minor: 'MINOR' };
const SEV_ORDER = { critical: 0, major: 1, minor: 2 };

function sortFindings(findings) {
  return findings.slice().sort((a, b) => {
    if (SEV_ORDER[a.severity] !== SEV_ORDER[b.severity]) return SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });
}

function scoreBanner(s) {
  const color = s.density === 0 ? C.green : s.density <= 6 ? C.yellow : C.red;
  // Box drawn from a single INNER width so the side bands always line up with
  // the corners (a hardcoded middle row drifts the moment the title changes).
  const INNER = 42;
  const title = 'S L O P   S C O R E';
  const padL = Math.floor((INNER - title.length) / 2);
  const padR = INNER - title.length - padL;
  out('');
  out(paint(C.bold, '  ' + g('tl') + g('h').repeat(INNER) + g('tr')));
  out(paint(C.bold, '  ' + g('v') + ' '.repeat(padL) + title + ' '.repeat(padR) + g('v')));
  out(paint(C.bold, '  ' + g('bl') + g('h').repeat(INNER) + g('br')));
  out('');
  const showDensity = s.lines >= 200;
  out('   ' + paint(color, paint(C.bold, `${s.weighted}`)) + paint(C.dim, ` weighted`)
    + (showDensity ? paint(C.dim, `   `) + paint(color, `${s.density}`) + paint(C.dim, ` / kLOC`) : '')
    + paint(C.dim, `   (${s.lines} lines scanned)`));
  const hasNonprod = s.nonprod && s.nonprod.total > 0;
  out('   ' + paint(C.red, `${s.counts.critical} critical`) + '   '
    + paint(C.yellow, `${s.counts.major} major`) + '   '
    + paint(C.gray, `${s.counts.minor} minor`)
    + (hasNonprod ? paint(C.dim, '   (production)') : ''));
  if (hasNonprod) {
    out('   ' + paint(C.dim, `+ ${s.nonprod.total} in test / tooling — reported, not scored`));
  }
  const total = s.counts.critical + s.counts.major + s.counts.minor;
  if (s.topRules && s.topRules.length >= 2 && total >= 3) {
    out('   ' + paint(C.dim, `by rule: ${s.topRules.map(([id, n]) => `${id} ×${n}`).join(' · ')}`));
  }
  if (s.capped) {
    out('   ' + paint(C.dim, '(score caps each rule so one detector can\'t define the verdict)'));
  }
  out('');
  out('   ' + paint(C.bold, paint(color, g('arrow') + ' ' + s.verdict)));
  if (s.suppressed > 0) {
    out('   ' + paint(C.dim, `${s.suppressed} finding${s.suppressed === 1 ? '' : 's'} suppressed inline`));
  }
  out('');
}

function terminalReport(result, s, options = {}) {
  const findings = sortFindings(result.findings);
  out('');
  out(paint(C.cyan, paint(C.bold, '  slopscore')) + paint(C.dim, `  ${g('dot')}  ${result.fileCount} files  ${g('dot')}  ${s.kloc} kLOC`));
  if (result.baseline) {
    out('  ' + paint(C.dim, `against baseline ${g('dot')} ${result.baseline.known} known finding${result.baseline.known === 1 ? '' : 's'} hidden ${g('dot')} showing only what's new`));
  }
  if (findings.length === 0) {
    out('');
    out('   ' + paint(C.green, paint(C.bold, `${g('check')} No slop patterns detected. Pristine.`)));
    scoreBanner(s);
    staleSection(result);
    return;
  }
  out('');
  let lastFile = null;
  const max = options.max || findings.length;
  for (const f of findings.slice(0, max)) {
    if (f.file !== lastFile) { out('  ' + paint(C.bold, f.file)); lastFile = f.file; }
    const sev = paint(SEV_COLOR[f.severity], sevLabel(f.severity));
    const conf = f.confidence && f.confidence !== 'high' ? paint(C.dim, ` ~${f.confidence} confidence`) : '';
    out(`    ${paint(C.dim, ':' + f.line)}  ${sev}  ${paint(C.dim, '[' + f.id + ']')} ${f.title}${conf}`);
    out(`        ${paint(C.dim, f.snippet)}`);
    out(`        ${paint(C.cyan, 'fix:')} ${f.fix}`);
  }
  if (findings.length > max) out(paint(C.dim, `\n  ${g('ellipsis')} and ${findings.length - max} more (raise --max to see all)`));
  scoreBanner(s);
  out(paint(C.dim, `  Authority: ${g('green')} auto-fixable  ${g('dot')}  ${g('yellow')} propose (review)  ${g('dot')}  ${g('red')} flag (human decision)`));
  out(paint(C.dim, '  Full catalog + fix authority for all 174 patterns: ANTI_SLOP_PROTOCOL.md'));
  staleSection(result);
  out('');
}

// Stale suppressions: a `slopscore-disable` directive whose finding no longer
// exists. Surfaced (not gated) so the codebase doesn't accumulate dead directives.
function staleSection(result) {
  const stale = result.staleSuppressions || [];
  if (!stale.length) return;
  out('');
  out(paint(C.yellow, `  ${stale.length} stale suppression${stale.length === 1 ? '' : 's'} `)
    + paint(C.dim, `${g('dot')} the finding each one hid is gone — remove the directive:`));
  for (const x of stale) {
    out(paint(C.dim, `    ${x.file}:${x.line}${x.ids ? ` [${x.ids.join(',')}]` : ' [all]'}`));
  }
}

function jsonReport(result, s) {
  out(JSON.stringify({
    score: s, fileCount: result.fileCount, totalLines: result.totalLines,
    findings: sortFindings(result.findings),
    staleSuppressions: result.staleSuppressions || [],
  }, null, 2));
}

function markdownReport(result, s) {
  const findings = sortFindings(result.findings);
  const lines = [];
  lines.push(`# 🩺 Slop Report`);
  lines.push('');
  lines.push(`**Scanned:** ${result.fileCount} files · ${s.kloc} kLOC`);
  lines.push('');
  lines.push('| 🔴 Critical | 🟠 Major | 🟡 Minor | Weighted | Density /kLOC | Verdict |');
  lines.push('|:--:|:--:|:--:|:--:|:--:|:--|');
  lines.push(`| ${s.counts.critical} | ${s.counts.major} | ${s.counts.minor} | ${s.weighted} | ${s.density} | ${s.verdict} |`);
  lines.push('');
  if (findings.length) {
    lines.push('| Severity | ID | Pattern | Location | Fix |');
    lines.push('|----------|----|---------|----------|-----|');
    for (const f of findings) {
      lines.push(`| ${f.severity} | ${f.id} | ${f.title} | \`${f.file}:${f.line}\` | ${f.fix} |`);
    }
  } else {
    lines.push('No slop patterns detected. Pristine.');
  }
  out(lines.join('\n'));
}

function agentReport(result, s) {
  // Compact, ~1 line per finding, to conserve an agent's context window.
  const findings = sortFindings(result.findings);
  const np = s.nonprod ? s.nonprod.total : 0;
  out(`SLOP_SCORE weighted=${s.weighted} density=${s.density}/kLOC verdict="${s.verdict}" crit=${s.counts.critical} major=${s.counts.major} minor=${s.counts.minor} nonprod=${np}`);
  for (const f of findings) {
    out(`${SEV_TAG[f.severity]} [${f.id}] ${f.file}:${f.line} ${f.title} | zone=${f.zone || 'production'} | confidence=${f.confidence || 'high'} | authority=${f.authority} | fix: ${f.fix}`);
  }
  for (const x of result.staleSuppressions || []) {
    out(`STALE_SUPPRESSION ${x.file}:${x.line}${x.ids ? ` [${x.ids.join(',')}]` : ' [all]'} | remove the dead directive`);
  }
  out('NEXT: fix production auto+propose findings per ANTI_SLOP_PROTOCOL.md, re-scan, drive production crit+major to 0 (zone=test is lower priority).');
}

// SARIF 2.1.0 — ingested by GitHub code scanning to annotate the PR diff inline.
const SARIF_LEVEL = { critical: 'error', major: 'warning', minor: 'note' };
function sarifReport(result) {
  const findings = sortFindings(result.findings);
  const ruleMap = new Map();
  for (const f of findings) if (!ruleMap.has(f.id)) ruleMap.set(f.id, f);
  const rules = Array.from(ruleMap.values()).map((f) => ({
    id: f.id,
    name: f.title,
    shortDescription: { text: f.title },
    helpUri: 'https://github.com/Vinay-O/slopscore/blob/main/ANTI_SLOP_PROTOCOL.md',
    properties: { category: f.category },
  }));
  const results = findings.map((f) => ({
    ruleId: f.id,
    level: SARIF_LEVEL[f.severity] || 'warning',
    message: { text: `${f.title} — ${f.fix}` },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: f.file },
        region: { startLine: Math.max(1, f.line) },
      },
    }],
    properties: {
      zone: f.zone || 'production', severity: f.severity,
      confidence: f.confidence || 'high', authority: f.authority,
    },
  }));
  out(JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'slopscore',
          version: pkg.version,
          informationUri: 'https://github.com/Vinay-O/slopscore',
          rules,
        },
      },
      results,
    }],
  }, null, 2));
}

module.exports = {
  terminalReport, jsonReport, markdownReport, agentReport, sarifReport,
  setColor, setUnicode, supportsUnicode, captureTo,
  unicodeEnabled: () => useUnicode,
  glyph: g,
};
