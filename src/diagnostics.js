'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const err = (s) => process.stderr.write(s + '\n');

// Known top-level .slopscore.json keys. An unknown key (a typo like "failOnn")
// is warned about, not silently ignored — silent ignore gives a false sense of
// coverage.
const KNOWN_CONFIG_KEYS = new Set(['preset', 'ignore', 'failOn', 'rules', 'paths', 'customRules']);

function validateConfig(cfg) {
  const unknown = Object.keys(cfg || {}).filter((k) => !KNOWN_CONFIG_KEYS.has(k));
  for (const k of unknown) {
    err(`slopscore: warning — unknown .slopscore.json key "${k}" (known: ${[...KNOWN_CONFIG_KEYS].join(', ')}). Ignored.`);
  }
  return unknown;
}

// Files changed vs a git ref (default: staged + unstaged + untracked). Runs git in
// the user's own repo (the CWD they invoked on) — not inside an untrusted scanned
// tree — so it doesn't violate the scanner's no-git-in-scanned-dirs guarantee.
// Returns null if git isn't available / not a repo.
function gitChangedFiles(sinceRef) {
  const run = (args) => {
    try { return execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean); }
    catch { return null; }
  };
  const acc = [];
  if (sinceRef) {
    const diff = run(['diff', '--name-only', `${sinceRef}...HEAD`]);
    if (diff === null) return null;
    acc.push(...diff);
  } else {
    const diff = run(['diff', '--name-only', 'HEAD']);
    if (diff === null) return null;
    acc.push(...diff, ...(run(['ls-files', '--others', '--exclude-standard']) || []));
  }
  return [...new Set(acc)].filter((f) => fs.existsSync(f));
}

module.exports = { validateConfig, gitChangedFiles, KNOWN_CONFIG_KEYS };
