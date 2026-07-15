'use strict';

const fs = require('fs');
const path = require('path');

// Returns the parsed config plus the directory it was found in. Configured
// ignore paths resolve against that directory, so an ignore like "src/rules.js"
// is honored no matter which sub-path the user points the scan at.
function loadConfig(startDir) {
  let dir = path.resolve(startDir);
  const names = ['.slopscore.json', '.slopscorerc.json'];
  for (;;) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) {
        try { return { config: JSON.parse(fs.readFileSync(p, 'utf8')), baseDir: dir }; }
        catch { return { config: {}, baseDir: dir }; }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { config: {}, baseDir: path.resolve(startDir) };
}

// The directory to start the upward config search from, given the scan paths.
function configStartDir(paths) {
  const first = path.resolve(paths[0]);
  try { return fs.statSync(first).isDirectory() ? first : path.dirname(first); }
  catch { return process.cwd(); }
}

module.exports = { loadConfig, configStartDir };
