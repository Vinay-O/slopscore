'use strict';

// Positions where a `/` begins a regex literal rather than division — i.e. where
// a value is expected. Heuristic (covers the real cases); not a full JS lexer.
const REGEX_OK = new Set(['', '(', ',', '=', ':', '[', '{', ';', '!', '&', '|', '?', '+', '-', '*', '%', '<', '>', '~', '^']);

// Languages whose line comment is `#` (not `//`).
const HASH_LANGS = new Set(['.py', '.rb', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.toml', '.pl']);

// Classify every character as code (0), comment (1), or string (2). String- and
// regex-literal-aware so a `//` inside "http://…" or /https:\/\// isn't a comment.
// Language-aware: `#` comments for Python/Ruby/shell, and Python triple-quoted
// docstrings (which span lines). `respectComments` rules skip code that's in a
// comment; `codeOnly` rules skip comments AND strings (so an API name mentioned in
// a docstring or a SQL example in a string isn't read as live code).
function commentMask(lines, ext) {
  const hash = HASH_LANGS.has(ext);
  const triple = ext === '.py';
  const mask = [];
  let inBlock = false;    // /* … */ (carries across lines)
  let inTriple = null;    // '"""' or "'''" docstring (carries across lines)
  for (const line of lines) {
    const kind = new Array(line.length).fill(0);
    let i = 0;
    let inStr = null;   // active single-line quote char (' " `), or null
    let prevSig = '';   // last significant (non-space) char seen
    while (i < line.length) {
      const ch = line[i];
      if (inTriple) {
        kind[i] = 2;
        if (line.startsWith(inTriple, i)) { kind[i + 1] = 2; kind[i + 2] = 2; inTriple = null; i += 3; prevSig = '"'; continue; }
        i += 1; continue;
      }
      if (inBlock) {
        kind[i] = 1;
        if (ch === '*' && line[i + 1] === '/') { kind[i + 1] = 1; inBlock = false; i += 2; prevSig = '/'; continue; }
        i += 1; continue;
      }
      if (inStr) {
        kind[i] = 2;
        if (ch === '\\') { if (i + 1 < line.length) kind[i + 1] = 2; i += 2; continue; }
        if (ch === inStr) { inStr = null; prevSig = ch; i += 1; continue; }
        i += 1; continue;
      }
      if (ch === ' ' || ch === '\t') { i += 1; continue; } // whitespace doesn't change prevSig
      if (triple && (line.startsWith('"""', i) || line.startsWith("'''", i))) {
        const q = line.slice(i, i + 3);
        const close = line.indexOf(q, i + 3);
        if (close !== -1) { for (let j = i; j <= close + 2; j += 1) kind[j] = 2; i = close + 3; prevSig = '"'; continue; }
        kind[i] = kind[i + 1] = kind[i + 2] = 2; inTriple = q; i += 3; continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; kind[i] = 2; prevSig = ch; i += 1; continue; }
      if (hash && ch === '#') { for (let j = i; j < line.length; j += 1) kind[j] = 1; break; }
      if (!hash && ch === '/' && line[i + 1] === '/') { for (let j = i; j < line.length; j += 1) kind[j] = 1; break; }
      if (!hash && ch === '/' && line[i + 1] === '*') { kind[i] = kind[i + 1] = 1; inBlock = true; i += 2; continue; }
      if (!hash && ch === '/' && REGEX_OK.has(prevSig)) {
        // Skip a regex literal: advance to the closing unescaped '/' that isn't
        // inside a [character class]. If none on this line, treat '/' as division.
        let j = i + 1; let inClass = false; let closed = false;
        while (j < line.length) {
          const c = line[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) { closed = true; j += 1; break; }
          j += 1;
        }
        if (closed) { i = j; prevSig = '/'; continue; }
        prevSig = '/'; i += 1; continue;
      }
      prevSig = ch; i += 1;
    }
    mask.push(kind);
  }
  return mask;
}

module.exports = { commentMask };
