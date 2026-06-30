'use strict';

const fs = require('fs');
const path = require('path');
const { FIXERS } = require('./fixers');
const { LINE_RULES, WHOLE_FILE_RULES, META_RULES } = require('./rules');

const AUTHORITY = {};
for (const r of LINE_RULES.concat(WHOLE_FILE_RULES, META_RULES)) AUTHORITY[r.id] = r.authority;

const fixableIds = () => Object.keys(FIXERS).sort();

// A braceless control header (`if (x)` / `for (…)` / `else`) makes the next
// statement its single body. Removing that statement would silently promote the
// FOLLOWING line into the body — so refuse to delete a line whose previous
// non-blank line is such a header. Conservative: when unsure, keep the line.
function safeToRemove(lines, idx) {
  for (let p = idx - 1; p >= 0; p -= 1) {
    const prev = lines[p].trim();
    if (prev === '') continue;
    if (/(?:^|[)\s])(?:if|for|while|else\s+if)\s*\([^{]*\)\s*$/.test(prev) || /(?:^|\s)else\s*$/.test(prev) || /=>\s*$/.test(prev)) return false;
    return true;
  }
  return true;
}
// Fixers that run on a plain `slopscore fix`: the rule is AUTO-authority, so the
// transform is behavior-preserving in every case the detector matches.
const autoFixableIds = () => fixableIds().filter((id) => AUTHORITY[id] === 'auto');
// Fixers that exist but are opt-in via --only, because the rule is propose/flag
// (the fix is context-dependent — e.g. removing a Python print that's real output).
const optInFixableIds = () => fixableIds().filter((id) => AUTHORITY[id] !== 'auto');

// Turn a scan result into a per-file edit plan. A fixer is applied when the rule
// is AUTO-authority (safe by default) OR the user named it explicitly with --only.
// At most one edit lands per source line so two rules can't fight over the same line.
function planFixes(result, opts = {}) {
  const only = opts.only && opts.only.length ? new Set(opts.only) : null;
  const except = opts.except && opts.except.length ? new Set(opts.except) : null;
  const wanted = (id) => FIXERS[id]
    && (only ? only.has(id) : AUTHORITY[id] === 'auto')
    && (!except || !except.has(id));

  const byFile = new Map();
  for (const f of result.findings) {
    if (!wanted(f.id)) continue;
    const abs = path.resolve(result.baseDir || process.cwd(), f.file);
    if (!byFile.has(abs)) byFile.set(abs, []);
    byFile.get(abs).push(f);
  }

  const plan = [];
  for (const [abs, findings] of byFile) {
    let lines;
    try { lines = fs.readFileSync(abs, 'utf8').split('\n'); } catch { continue; }
    const edits = [];
    const claimed = new Set();
    for (const f of findings.sort((a, b) => a.line - b.line)) {
      const idx = f.line - 1;
      if (idx < 0 || idx >= lines.length || claimed.has(idx)) continue;
      const before = lines[idx];
      const res = FIXERS[f.id](before);
      if (!res) continue;
      if (res.remove && !safeToRemove(lines, idx)) continue;
      if (res.remove) edits.push({ id: f.id, line: f.line, before, after: null });
      else if (res.replace != null && res.replace !== before) edits.push({ id: f.id, line: f.line, before, after: res.replace });
      else continue;
      claimed.add(idx);
    }
    if (edits.length) {
      plan.push({ file: abs, rel: path.relative(result.baseDir || process.cwd(), abs) || path.basename(abs), lines, edits });
    }
  }
  return plan;
}

// Apply a plan to disk. Edits are applied from the bottom up so a line removal
// never shifts the index of an edit above it.
function applyPlan(plan) {
  for (const file of plan) {
    const out = file.lines.slice();
    for (const e of file.edits.slice().sort((a, b) => b.line - a.line)) {
      const idx = e.line - 1;
      if (e.after === null) out.splice(idx, 1);
      else out[idx] = e.after;
    }
    fs.writeFileSync(file.file, out.join('\n'), 'utf8');
  }
}

module.exports = { planFixes, applyPlan, fixableIds, autoFixableIds, optInFixableIds };
