'use strict';

const crypto = require('crypto');

// Cross-file copy-paste detection (catalog 068). Hash every window of DUP_WINDOW
// consecutive *non-trivial* lines (normalized); a window appearing in 2+ places
// (different files, or well-separated in one file) is duplicated. Overlapping
// windows from one physical block merge into a single finding. Conservative —
// trivial lines (imports, braces, short lines) are excluded so shared boilerplate
// doesn't read as copy-paste.
const DUP_WINDOW = 6;
const CODE_FOR_DUP = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.py', '.go', '.rb', '.php']);

function isTrivialDupLine(line) {
  const s = line.trim();
  return s.length < 12 || /^[\s)}\];,{(]*$/.test(s) || /^(import\b|export\s*\{|from\b|\/\/|\*|\/\*|@)/.test(s);
}

// JSX markup / CSS-in-JS / style lines. Repeated *presentational* blocks (MUI `sx`,
// status pills, className soup) are real but low-risk — a component-extraction, not a
// logic-duplication bug — so a style-heavy duplicated block is scored minor, not major.
function isStylingLine(line) {
  const s = line.trim();
  return /^<\/?[A-Za-z]/.test(s)                       // JSX element  <Box> / </Box>
    || /^[\w-]+\s*=\s*[{"'`]/.test(s)                  // JSX/HTML attribute  prop={ / prop="
    || /^['"]?[\w-]+['"]?\s*:\s*['"{[(]/.test(s)       // object/CSS key: '…' / { / [ / (   (sx, style)
    || /(sx=|className=|class=|style=|css=)/.test(s)   // styling props anywhere on the line
    || /^\.\.\.[\w]/.test(s);                          // spread props/styles
}

function checkDuplication(codeFiles, findings, metaFinding) {
  const index = new Map();
  codeFiles.forEach((cf, fi) => {
    const nt = [];
    for (let n = 0; n < cf.lines.length; n += 1) {
      if (!isTrivialDupLine(cf.lines[n])) nt.push({ t: cf.lines[n].trim().replace(/\s+/g, ' '), line: n + 1 });
    }
    for (let i = 0; i + DUP_WINDOW <= nt.length; i += 1) {
      const win = nt.slice(i, i + DUP_WINDOW);
      const h = crypto.createHash('sha1').update(win.map((w) => w.t).join('\n')).digest('hex').slice(0, 16);
      if (!index.has(h)) index.set(h, []);
      index.get(h).push({ fi, start: win[0].line, end: win[DUP_WINDOW - 1].line });
    }
  });
  const dupByFile = new Map();
  for (const occ of index.values()) {
    if (occ.length < 2) continue;
    const starts = occ.map((o) => o.start).sort((a, b) => a - b);
    const separated = new Set(occ.map((o) => o.fi)).size > 1
      || starts.some((v, k) => k > 0 && v - starts[k - 1] >= DUP_WINDOW);
    if (!separated) continue;
    for (const o of occ) {
      if (!dupByFile.has(o.fi)) dupByFile.set(o.fi, []);
      dupByFile.get(o.fi).push({ start: o.start, end: o.end });
    }
  }
  for (const [fi, regions] of dupByFile) {
    regions.sort((a, b) => a.start - b.start);
    let cs = null;
    let ce = null;
    const flush = () => {
      if (cs == null) return;
      const slice = codeFiles[fi].lines.slice(cs - 1, ce).filter((l) => !isTrivialDupLine(l));
      const presentational = slice.length > 0 && slice.filter(isStylingLine).length / slice.length >= 0.6;
      const f = metaFinding('068', codeFiles[fi].file, {
        line: cs,
        severity: presentational ? 'minor' : 'major',
        snippet: `${presentational ? 'repeated markup/style' : 'duplicated code'} block (lines ${cs}-${ce})`,
      });
      f.zone = codeFiles[fi].zone;
      findings.push(f);
    };
    for (const r of regions) {
      if (cs == null) { cs = r.start; ce = r.end; } else if (r.start <= ce + 1) { ce = Math.max(ce, r.end); } else { flush(); cs = r.start; ce = r.end; }
    }
    flush();
  }
}

module.exports = { checkDuplication, CODE_FOR_DUP };
