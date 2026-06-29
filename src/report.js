'use strict';

const out = (s) => process.stdout.write(s + '\n');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', gray: '\x1b[90m',
};
let useColor = true;
const paint = (code, s) => (useColor ? code + s + C.reset : s);
const setColor = (on) => { useColor = on; };

const SEV_COLOR = { critical: C.red, major: C.yellow, minor: C.gray };
const SEV_LABEL = { critical: '🔴 CRIT', major: '🟠 MAJOR', minor: '🟡 MINOR' };
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
  out(paint(C.bold, '  ╔' + '═'.repeat(INNER) + '╗'));
  out(paint(C.bold, '  ║' + ' '.repeat(padL) + title + ' '.repeat(padR) + '║'));
  out(paint(C.bold, '  ╚' + '═'.repeat(INNER) + '╝'));
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
  out('');
  out('   ' + paint(C.bold, paint(color, '▶ ' + s.verdict)));
  out('');
}

function terminalReport(result, s, options = {}) {
  const findings = sortFindings(result.findings);
  out('');
  out(paint(C.cyan, paint(C.bold, '  slopscore')) + paint(C.dim, `  ·  ${result.fileCount} files  ·  ${s.kloc} kLOC`));
  if (findings.length === 0) {
    out('');
    out('   ' + paint(C.green, paint(C.bold, '✓ No slop patterns detected. Breathtaking.')));
    scoreBanner(s);
    return;
  }
  out('');
  let lastFile = null;
  const max = options.max || findings.length;
  for (const f of findings.slice(0, max)) {
    if (f.file !== lastFile) { out('  ' + paint(C.bold, f.file)); lastFile = f.file; }
    const sev = paint(SEV_COLOR[f.severity], SEV_LABEL[f.severity]);
    out(`    ${paint(C.dim, ':' + f.line)}  ${sev}  ${paint(C.dim, '[' + f.id + ']')} ${f.title}`);
    out(`        ${paint(C.dim, f.snippet)}`);
    out(`        ${paint(C.cyan, 'fix:')} ${f.fix}`);
  }
  if (findings.length > max) out(paint(C.dim, `\n  … and ${findings.length - max} more (raise --max to see all)`));
  scoreBanner(s);
  out(paint(C.dim, '  Authority: 🟢 auto-fixable  ·  🟡 propose (review)  ·  🔴 flag (human decision)'));
  out(paint(C.dim, '  Full catalog + fix authority for all 150 patterns: ANTI_SLOP_PROTOCOL.md'));
  out('');
}

function jsonReport(result, s) {
  out(JSON.stringify({
    score: s, fileCount: result.fileCount, totalLines: result.totalLines,
    findings: sortFindings(result.findings),
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
    lines.push('No slop patterns detected. Breathtaking.');
  }
  out(lines.join('\n'));
}

function agentReport(result, s) {
  // Compact, ~1 line per finding, to conserve an agent's context window.
  const findings = sortFindings(result.findings);
  const np = s.nonprod ? s.nonprod.total : 0;
  out(`SLOP_SCORE weighted=${s.weighted} density=${s.density}/kLOC verdict="${s.verdict}" crit=${s.counts.critical} major=${s.counts.major} minor=${s.counts.minor} nonprod=${np}`);
  for (const f of findings) {
    out(`${SEV_TAG[f.severity]} [${f.id}] ${f.file}:${f.line} ${f.title} | zone=${f.zone || 'production'} | authority=${f.authority} | fix: ${f.fix}`);
  }
  out('NEXT: fix production auto+propose findings per ANTI_SLOP_PROTOCOL.md, re-scan, drive production crit+major to 0 (zone=test is lower priority).');
}

module.exports = { terminalReport, jsonReport, markdownReport, agentReport, setColor };
