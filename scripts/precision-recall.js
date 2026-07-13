'use strict';

// Precision/recall on a LABELED corpus (test/corpus/labeled). Each file is either a
// seeded true-positive (a known vulnerability → the rule id that should fire) or a
// negative (clean, or a tempting-but-safe "hard negative"). We measure the ACTIONABLE
// signal — findings at medium-or-higher confidence, i.e. what a CI gate would use
// (`--min-confidence medium`); low-confidence "soft nudges" are excluded by design.
//
//   npm run pr
//
// This is a small, reproducible, honestly-labeled corpus — a regression guard on the
// tool's own false-positive/false-negative rate, not a claim about all real-world code.

const fs = require('fs');
const path = require('path');
const { scan } = require('../src/scanner');

const DIR = path.join(__dirname, '..', 'corpus', 'labeled');

// Ground truth: filename → the rule ids that SHOULD fire (complete set). [] = must be clean.
const GROUND_TRUTH = {
  // seeded true-positives
  'tp_secret.js': ['058'],
  'tp_sqli.js': ['072'],
  'tp_xss.jsx': ['071'],
  'tp_eval.js': ['172'],
  'tp_emptycatch.js': ['053'],
  'tp_tls.js': ['163'],
  'tp_pickle.py': ['167'],
  'tp_debugger.js': ['185'],
  'tp_pathtrav.js': ['253'],
  'tp_ssrf.js': ['255'],
  'tp_massassign.js': ['257'],
  'tp_weakcipher.js': ['259'],
  'tp_strcpy.c': ['263'],
  // hard negatives — tempting but safe (must NOT fire at medium+)
  'hn_param_sql.js': [],
  'hn_textcontent.jsx': [],
  'hn_env_secret.js': [],
  'hn_demo_secret.js': [],
  'hn_guarded_json.js': [],
  'hn_safe_fetch.js': [],
  'hn_safe_read.js': [],
  'hn_allowlist.js': [],
  'hn_cipheriv.js': [],
  'hn_snprintf.c': [],
  // clean controls
  'tn_clean1.js': [],
  'tn_clean2.ts': [],
  'tn_clean3.py': [],
};

const ACTIONABLE = new Set(['high', 'medium']); // the tier a CI gate uses

function foundIds(file) {
  const findings = scan(path.join(DIR, file)).findings.filter((f) => ACTIONABLE.has(f.confidence || 'high'));
  return new Set(findings.map((f) => f.id));
}

function evaluate() {
  let tp = 0; let fp = 0; let fn = 0;
  const rows = [];
  for (const [file, expected] of Object.entries(GROUND_TRUTH)) {
    const exp = new Set(expected);
    const found = foundIds(file);
    const hits = [...found].filter((id) => exp.has(id));
    const falses = [...found].filter((id) => !exp.has(id));
    const misses = [...exp].filter((id) => !found.has(id));
    tp += hits.length; fp += falses.length; fn += misses.length;
    rows.push({ file, expected: [...exp], falses, misses });
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { tp, fp, fn, precision, recall, rows };
}

function main() {
  const r = evaluate();
  process.stdout.write('\n  slopscore precision/recall  (labeled corpus, medium+ confidence)\n\n');
  process.stdout.write(`  files: ${r.rows.length}   TP=${r.tp}  FP=${r.fp}  FN=${r.fn}\n`);
  process.stdout.write(`  precision = ${(r.precision * 100).toFixed(1)}%   recall = ${(r.recall * 100).toFixed(1)}%\n\n`);
  const problems = r.rows.filter((x) => x.falses.length || x.misses.length);
  if (problems.length) {
    for (const x of problems) {
      if (x.falses.length) process.stdout.write(`  ✗ ${x.file}: false positive(s) ${x.falses.join(', ')}\n`);
      if (x.misses.length) process.stdout.write(`  ✗ ${x.file}: missed ${x.misses.join(', ')}\n`);
    }
    process.stdout.write('\n');
  } else {
    process.stdout.write('  ✓ no false positives, no missed seeds.\n\n');
  }
  return r;
}

if (require.main === module) main();
module.exports = { evaluate };
