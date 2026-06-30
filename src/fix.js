'use strict';

const fs = require('fs');
const path = require('path');
const { FIXERS } = require('./fixers');

const fixableIds = () => Object.keys(FIXERS).sort();

// Turn a scan result into a per-file edit plan. Only findings whose rule has a
// fixer (and passes the --only/--except filter) are considered, and at most one
// edit lands per source line so two rules can't fight over the same line.
function planFixes(result, opts = {}) {
  const only = opts.only && opts.only.length ? new Set(opts.only) : null;
  const except = opts.except && opts.except.length ? new Set(opts.except) : null;
  const wanted = (id) => FIXERS[id] && (!only || only.has(id)) && (!except || !except.has(id));

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

module.exports = { planFixes, applyPlan, fixableIds };
