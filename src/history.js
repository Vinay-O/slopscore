'use strict';

const fs = require('fs');

const SPARK = '▁▂▃▄▅▆▇█';

// A tiny ASCII sparkline of a numeric series, scaled to its own max.
function sparkline(values) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  return values.map((v) => SPARK[Math.min(SPARK.length - 1, Math.round((v / max) * (SPARK.length - 1)))]).join('');
}

function loadHistory(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(d.runs) ? d.runs : [];
  } catch {
    return [];
  }
}

// Append one run and keep the most recent `max`. Returns the trimmed series.
function appendHistory(file, entry, max = 100) {
  const runs = loadHistory(file).concat(entry).slice(-max);
  fs.writeFileSync(file, `${JSON.stringify({ version: 1, runs }, null, 2)}\n`);
  return runs;
}

// Human delta of `weighted` vs the previous run.
function trendDelta(prevRuns, weighted) {
  if (!prevRuns.length) return '';
  const last = prevRuns[prevRuns.length - 1].weighted;
  if (last === 0) return weighted === 0 ? 'still 0' : 'up from 0';
  const pct = Math.round(((weighted - last) / last) * 100);
  if (pct === 0) return 'no change';
  return pct < 0 ? `down ${-pct}%` : `up ${pct}%`;
}

module.exports = { sparkline, loadHistory, appendHistory, trendDelta };
