'use strict';

const WEIGHTS = { critical: 10, major: 3, minor: 1 };

const VERDICTS = [
  { max: 0, label: 'Breathtaking. Ship it.' },
  { max: 2, label: 'Clean. Human-grade.' },
  { max: 6, label: 'Mild slop. A focused pass fixes it.' },
  { max: 12, label: 'Heavy slop. Needs real work.' },
  { max: Infinity, label: 'Vibe-coded. Audit before anyone depends on it.' },
];

function tally(findings) {
  const c = { critical: 0, major: 0, minor: 0 };
  for (const f of findings) if (c[f.severity] !== undefined) c[f.severity] += 1;
  return c;
}

const weigh = (c) => c.critical * WEIGHTS.critical + c.major * WEIGHTS.major + c.minor * WEIGHTS.minor;

/**
 * @typedef {Object} Score
 * @property {{critical:number,major:number,minor:number}} counts  Production findings only.
 * @property {number} weighted  critical×10 + major×3 + minor×1, production only.
 * @property {number} density   Weighted production findings per 1,000 production lines.
 * @property {string} verdict
 * @property {number} kloc
 * @property {number} lines
 * @property {{total:number, counts:object}} nonprod  Findings in test/tooling (not scored).
 */

/**
 * Reduce a scan result to a severity-weighted Slop Score. The headline reflects
 * PRODUCTION risk only: findings in test/tooling/scripts are reported separately
 * (a test-runner execSync isn't the same risk as a production SQL injection).
 * @param {import('./scanner').ScanResult} result
 * @returns {Score}
 */
function score(result) {
  const prod = result.findings.filter((f) => f.zone !== 'test');
  const nonprodList = result.findings.filter((f) => f.zone === 'test');
  const counts = tally(prod);
  const weighted = weigh(counts);
  // Density over PRODUCTION lines so the headline reflects shipped-code risk.
  const prodLines = result.productionLines != null ? result.productionLines : result.totalLines;
  const kloc = prodLines / 1000;
  // Round density once and derive the verdict from that same value, so the
  // printed number, the banner color, and the verdict can never disagree at a
  // band boundary.
  const density = kloc > 0 ? Math.round((weighted / kloc) * 10) / 10 : 0;
  const verdict = VERDICTS.find((v) => density <= v.max).label;
  const klocRounded = kloc >= 1 ? Math.round(kloc * 10) / 10 : Math.round(kloc * 100) / 100;
  return {
    counts, weighted, density, verdict,
    kloc: klocRounded, lines: prodLines,
    nonprod: { total: nonprodList.length, counts: tally(nonprodList) },
  };
}

module.exports = { score, WEIGHTS, VERDICTS };
