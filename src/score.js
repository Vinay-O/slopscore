'use strict';

const WEIGHTS = { critical: 10, major: 3, minor: 1 };
// No single rule should define the verdict: each rule contributes at most this
// many findings to the weighted score (true counts are still reported).
const CAP_PER_RULE = 10;

const VERDICTS = [
  { max: 0, label: 'Pristine. Ship it.' },
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
  // Per-rule production counts (for the breakdown line) and the weighted score.
  // The score CAPS each rule at CAP_PER_RULE findings so one noisy detector can't
  // define the verdict (e.g. 45 repeated-markup blocks). Counts stay true; the
  // breakdown makes the relationship transparent.
  const byRule = {};
  for (const f of prod) byRule[f.id] = (byRule[f.id] || 0) + 1;
  const seen = {};
  let weighted = 0;
  let capped = false;
  for (const f of prod) {
    seen[f.id] = (seen[f.id] || 0) + 1;
    if (seen[f.id] <= CAP_PER_RULE) weighted += WEIGHTS[f.severity] || 0;
    else capped = true;
  }
  // Density over PRODUCTION lines so the headline reflects shipped-code risk.
  const prodLines = result.productionLines != null ? result.productionLines : result.totalLines;
  const kloc = prodLines / 1000;
  // Round density once and derive the verdict from that same value, so the
  // printed number, the banner color, and the verdict can never disagree at a
  // band boundary.
  const density = kloc > 0 ? Math.round((weighted / kloc) * 10) / 10 : 0;
  const verdict = VERDICTS.find((v) => density <= v.max).label;
  const klocRounded = kloc >= 1 ? Math.round(kloc * 10) / 10 : Math.round(kloc * 100) / 100;
  // Top rules by count, for the per-rule breakdown line.
  const topRules = Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return {
    counts, weighted, density, verdict,
    kloc: klocRounded, lines: prodLines,
    nonprod: { total: nonprodList.length, counts: tally(nonprodList) },
    suppressed: result.suppressed || 0,
    byRule, topRules, capped,
  };
}

module.exports = { score, WEIGHTS, VERDICTS };
