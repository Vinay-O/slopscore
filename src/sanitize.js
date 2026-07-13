'use strict';

// Findings carry a `snippet` copied verbatim from a SCANNED (untrusted) file. That
// text is later printed to a terminal and embedded in JUnit XML / JSON / SARIF /
// Markdown reports. A scanned file containing ANSI/OSC escape sequences (e.g.
// `\x1b[2J` clear-screen, cursor moves, or exploitable terminal sequences) would
// otherwise drive the reader's terminal — a control-character injection.
//
// sanitizeSnippet strips escape sequences and any remaining C0/C1 control chars
// (keeping only tab among the controls) so the snippet is safe to display anywhere.
// Applied at the source (where a finding is built) so every output sink is covered.
function sanitizeSnippet(s) {
  if (typeof s !== 'string') return s;
  return s
    // OSC sequences: ESC ] … (terminated by BEL or ST)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // CSI and other two-char / parameterized escape sequences
    .replace(/\x1b[@-_][0-?]*[ -/]*[@-~]/g, '')
    // any stray ESC left over
    .replace(/\x1b/g, '')
    // remaining C0/C1 control chars incl. CR and the 8-bit CSI (0x9b); keep TAB (0x09)
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}

module.exports = { sanitizeSnippet, looksBinary };

// True for content that isn't real source text: a NUL byte (classic binary marker)
// or a high density of U+FFFD replacement chars (a non-UTF-8 file decoded as UTF-8).
// Scanning such a file yields garbage findings, so the scanner skips it.
function looksBinary(text) {
  if (typeof text !== 'string') return true;
  if (text.includes('\u0000')) return true;
  const sample = text.length > 2000 ? text.slice(0, 2000) : text;
  if (sample.length === 0) return false;
  let repl = 0;
  for (let i = 0; i < sample.length; i += 1) if (sample.charCodeAt(i) === 0xFFFD) repl += 1;
  return repl / sample.length > 0.05;
}
