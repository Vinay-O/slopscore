'use strict';

// Inline suppression directives:
//   // slopscore-disable-next-line 054 — deliberate cast at the JSON boundary
//   // slopscore-disable-line 099
// One or more ids suppress just those rules; a bare directive suppresses all rules
// on the target line. Ids must come before any reason text (so "fix in 2 weeks"
// isn't parsed as rule 002).
//
// The directive must be the FIRST comment's leading text, so a line that merely
// *documents* the syntax (`//   // slopscore-disable-next-line 054`) or quotes it
// in prose is not mistaken for a real directive — otherwise this very file would
// suppress (and then report as stale) its own examples.
const OPENER = /(\/\/|#|\/\*|<!--)\s*/;

// Returns { map, directives }:
//   map[lineIndex] = Set<id> | true (= all)   — for the fast suppression lookup
//   directives = [{ line, target, ids }]       — for stale-directive detection
function buildSuppressions(lines) {
  const map = [];
  const directives = [];
  for (let n = 0; n < lines.length; n += 1) {
    const open = lines[n].match(OPENER);
    if (!open) continue;
    const after = lines[n].slice(open.index + open[0].length);
    const m = after.match(/^slopscore-disable-(next-line|line)([^\n]*)/);
    if (!m) continue;
    const target = m[1] === 'next-line' ? n + 1 : n;
    const idPart = (m[2].match(/^[\s\d,]*/) || [''])[0];
    const ids = (idPart.match(/\d{2,3}/g) || []).map((s) => s.padStart(3, '0'));
    map[target] = ids.length ? new Set(ids) : true;
    directives.push({ line: n, target, ids: ids.length ? ids : null });
  }
  return { map, directives };
}

// ESLint inline directives:
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   // eslint-disable-line no-console, no-alert
//   /* eslint-disable-next-line no-eval */
// A rule whose `eslint` field names the disabled rule (or a bare directive that
// disables ALL rules on the line) is suppressed — slopscore should not re-litigate
// a finding the project has already, deliberately, signed off via ESLint. Block
// `/* eslint-disable */ … /* eslint-enable */` ranges are intentionally NOT honored
// (too easy to leave open across a whole file); only the line-scoped forms are.
//
// Returns map[lineIndex] = Set<eslintRuleName> | true (= all rules on that line).
function buildEslintSuppressions(lines) {
  const map = [];
  for (let n = 0; n < lines.length; n += 1) {
    const open = lines[n].match(OPENER);
    if (!open) continue;
    const after = lines[n].slice(open.index + open[0].length);
    const m = after.match(/^eslint-disable-(next-line|line)\b([^\n]*)/);
    if (!m) continue;
    const target = m[1] === 'next-line' ? n + 1 : n;
    // Strip a trailing block-comment close and any "-- reason" eslint comment.
    const rulePart = m[2].replace(/\*\/.*$/, '').replace(/--.*$/, '').trim();
    const names = rulePart ? rulePart.split(',').map((s) => s.trim()).filter(Boolean) : [];
    map[target] = names.length ? new Set(names) : true;
  }
  return map;
}

module.exports = { buildSuppressions, buildEslintSuppressions };
