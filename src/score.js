'use strict';

const WEIGHTS = { critical: 10, major: 3, minor: 1 };

const VERDICTS = [
  { max: 0, label: 'Breathtaking. Ship it.' },
  { max: 2, label: 'Clean. Human-grade.' },
  { max: 6, label: 'Mild slop. A focused pass fixes it.' },
  { max: 12, label: 'Heavy slop. Needs real work.' },
  { max: Infinity, label: 'Vibe-coded. Audit before anyone depends on it.' },
];

/**
 * @typedef {Object} Score
 * @property {{critical:number,major:number,minor:number}} counts
 * @property {number} weighted  critical×10 + major×3 + minor×1.
 * @property {number} density   Weighted findings per 1,000 lines.
 * @property {string} verdict
 * @property {number} kloc
 * @property {number} lines
 */

/**
 * Reduce a scan result to a severity-weighted Slop Score and density verdict.
 * @param {import('./scanner').ScanResult} result
 * @returns {Score}
 */
function score(result) {
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const f of result.findings) {
    if (counts[f.severity] !== undefined) counts[f.severity] += 1;
  }
  const weighted = counts.critical * WEIGHTS.critical
    + counts.major * WEIGHTS.major
    + counts.minor * WEIGHTS.minor;
  const kloc = result.totalLines / 1000;
  // Round density once and derive the verdict from that same value, so the
  // printed number, the banner color, and the verdict can never disagree at a
  // band boundary.
  const density = kloc > 0 ? Math.round((weighted / kloc) * 10) / 10 : 0;
  const verdict = VERDICTS.find((v) => density <= v.max).label;
  const klocRounded = kloc >= 1 ? Math.round(kloc * 10) / 10 : Math.round(kloc * 100) / 100;
  return {
    counts, weighted, density, verdict,
    kloc: klocRounded, lines: result.totalLines,
  };
}

module.exports = { score, WEIGHTS, VERDICTS };
