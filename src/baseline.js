'use strict';

const fs = require('fs');
const crypto = require('crypto');

// A stable identity for a finding — deliberately excludes the line number so that
// moving code up or down does NOT register as new slop, while changing the flagged
// code itself does. (id + relative path + normalized snippet.)
function fingerprint(f) {
  const snippet = String(f.snippet || '').trim().replace(/\s+/g, ' ');
  const key = `${f.id}|${f.file}|${snippet}`;
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

// Returns a Set of baselined fingerprints, or null if the file is missing/unreadable.
function loadBaseline(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Set(Array.isArray(data.fingerprints) ? data.fingerprints : []);
  } catch {
    return null;
  }
}

// Snapshot the current findings as the accepted baseline. Returns the count written.
function writeBaseline(file, findings, createdISO) {
  const fingerprints = Array.from(new Set(findings.map(fingerprint))).sort();
  const body = { version: 1, created: createdISO || '', count: fingerprints.length, fingerprints };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  return fingerprints.length;
}

module.exports = { fingerprint, loadBaseline, writeBaseline };
