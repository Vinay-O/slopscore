'use strict';

const fs = require('fs');
const path = require('path');

const DEP_BUDGET = 80;

// Structured supply-chain checks over package.json — accurate (JSON-parsed), low
// false-positive. Emits catalog findings via the shared metaFinding builder.
//   079 dependency bloat · 274 unpinned version · 275 non-registry source · 276 install script
function checkManifest(root, findings, metaFinding) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { return; }

  const deps = { ...(pkg.dependencies || {}) };
  const names = Object.keys(deps);
  if (names.length > DEP_BUDGET) {
    findings.push(metaFinding('079', pkgPath, {
      title: `Dependency bloat (${names.length} runtime deps)`, snippet: `${names.length} runtime dependencies`,
    }));
  }

  for (const [name, spec] of Object.entries(deps)) {
    const v = String(spec).trim();
    // Unpinned: floats to whatever the registry serves next.
    if (/^(\*|latest|x|X|)$/.test(v)) {
      findings.push(metaFinding('274', pkgPath, { snippet: `"${name}": "${spec}"` }));
    // Non-registry source: git / http / tarball / local / github shorthand — unaudited & mutable.
    } else if (/^(git[+:]|https?:|file:|github:|[\w.-]+\/[\w.-]+$)|\.t(ar\.)?gz$/i.test(v)) {
      findings.push(metaFinding('275', pkgPath, { snippet: `"${name}": "${spec}"` }));
    }
  }

  const scripts = pkg.scripts || {};
  for (const hook of ['preinstall', 'install', 'postinstall']) {
    if (scripts[hook]) findings.push(metaFinding('276', pkgPath, { snippet: `"scripts.${hook}": ${JSON.stringify(scripts[hook]).slice(0, 60)}` }));
  }
}

module.exports = { checkManifest };
