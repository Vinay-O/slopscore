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

module.exports = { buildSuppressions };
