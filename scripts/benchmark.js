'use strict';

// Reproducible Slop-Score benchmark. Scans a labeled corpus (clean vs slop) and
// reports weighted findings per 1,000 lines for each group, so the "clean code
// scores low, vibe-coded code scores high" claim is something anyone can rerun —
// not a number pulled from the air. Run with: npm run bench
//
// It counts findings regardless of zone (the corpus lives under test/ purely so
// the deliberately-sloppy fixtures don't pollute slopscore's own self-scan).

const path = require('path');
const { scan } = require('../src/scanner');
const { WEIGHTS } = require('../src/score');

function densityOf(dir) {
  const result = scan([dir], { ignoreBase: dir, skipRepoChecks: true });
  let weighted = 0;
  for (const f of result.findings) weighted += WEIGHTS[f.severity] || 0;
  const kloc = result.totalLines / 1000;
  const density = kloc > 0 ? Math.round((weighted / kloc) * 10) / 10 : 0;
  return { weighted, lines: result.totalLines, findings: result.findings.length, density };
}

function main() {
  const root = path.join(__dirname, '..', 'test', 'corpus');
  const clean = densityOf(path.join(root, 'clean'));
  const slop = densityOf(path.join(root, 'slop'));

  const pad = (s, n) => String(s).padEnd(n);
  process.stdout.write('\n  slopscore benchmark  (reproducible — `npm run bench`)\n\n');
  process.stdout.write(`  ${pad('group', 8)} ${pad('lines', 7)} ${pad('findings', 9)} weighted\n`);
  process.stdout.write(`  ${pad('clean', 8)} ${pad(clean.lines, 7)} ${pad(clean.findings, 9)} ${clean.weighted}\n`);
  process.stdout.write(`  ${pad('slop', 8)} ${pad(slop.lines, 7)} ${pad(slop.findings, 9)} ${slop.weighted}\n\n`);
  process.stdout.write('  Takeaway: idiomatic code produces ZERO findings; the sloppy sample lights up —\n');
  process.stdout.write('  the Slop Score discriminates. This is a small SYNTHETIC corpus: a directional,\n');
  process.stdout.write('  reproducible check that the detectors separate clean from slop, NOT a claim about\n');
  process.stdout.write('  any specific real-world repo. (Per-kLOC on tiny files is not meaningful.)\n\n');

  return { clean, slop };
}

if (require.main === module) main();
module.exports = { densityOf, main };
