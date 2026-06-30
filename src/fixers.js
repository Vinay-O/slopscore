'use strict';

// Deterministic, taste-free auto-fixes for a subset of the authority:auto rules.
// A fixer only runs on a line the scanner already flagged for that rule, so it
// inherits the scanner's full context (zones, comment-stripping, suppression).
//
// Each fixer receives the raw source line and returns one of:
//   { remove: true }       delete the line entirely
//   { replace: 'newline' } substitute the line
//   null                   can't safely fix THIS occurrence — leave it untouched
//
// The bar is "no human judgment and no behavior change a reviewer would dispute":
// stripping debug output, an idiom swap, or an additive a11y attribute. Anything
// that needs a name, a destination, or a design decision stays a PROPOSE/FLAG and
// is deliberately absent here.

// A line whose parentheses balance is a complete statement (not the first line of
// a multi-line call we'd be wrong to delete). Counting is enough for the guard;
// the worst case of parens inside a string is that we conservatively skip.
function balanced(line) {
  let depth = 0;
  for (const ch of line) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

const FIXERS = {
  // 052 — a standalone console.* debug statement on one line: remove it.
  '052': (line) => (/^\s*console\.\w+\([^]*\)\s*;?\s*$/.test(line) && balanced(line) ? { remove: true } : null),

  // 158 — a standalone fmt.Print/Printf/Println debug statement (Go): remove it.
  '158': (line) => (/^\s*fmt\.Print(f|ln)?\([^]*\)\s*$/.test(line) && balanced(line) ? { remove: true } : null),

  // 069 — a full-line step-narration comment: remove it. Trailing comments (code
  // then //…) are left alone so we never delete code.
  '069': (line) => (/^\s*\/\//.test(line) ? { remove: true } : null),

  // 081 — <img> without alt: add alt="" (decorative default; a human can describe it).
  '081': (line) => {
    if (!/<img\b/.test(line) || /\balt\s*=/.test(line)) return null;
    const replace = line.replace(/<img\b([^>]*?)(\s*\/?)>/, (_match, attrs, close) => `<img${attrs} alt=""${close}>`);
    return replace !== line ? { replace } : null;
  },

  // 152 — Python identity check written with ==/!= None: use is / is not (the
  // canonical, semantically-correct idiom). Only the `expr == None` form.
  '152': (line) => {
    const replace = line
      .replace(/!=\s*None\b/g, 'is not None')
      .replace(/==\s*None\b/g, 'is None');
    return replace !== line ? { replace } : null;
  },

  // 169 — target="_blank" without rel: add rel="noopener noreferrer" (additive,
  // closes the reverse-tabnabbing hole without changing behavior).
  '169': (line) => {
    if (!/target\s*=\s*['"]_blank['"]/.test(line) || /\brel\s*=/.test(line)) return null;
    const replace = line.replace(/(<a\b[^>]*?)(\s*\/?>)/, (_match, head, close) => `${head} rel="noopener noreferrer"${close}`);
    return replace !== line ? { replace } : null;
  },

  // 178 — a standalone Python print() debug statement: remove it.
  '178': (line) => (/^\s*print\s*\([^]*\)\s*$/.test(line) && balanced(line) ? { remove: true } : null),

  // 179 — Python `== True` / `!= False` are pure-removable (the `== False` /
  // `!= True` forms need a `not` and are left for a human).
  '179': (line) => {
    const replace = line.replace(/\s*==\s*True\b/g, '').replace(/\s*!=\s*False\b/g, '');
    return replace !== line ? { replace } : null;
  },

  // 180 — a standalone Rust debug-print macro (dbg!/println!/…): remove it.
  '180': (line) => (/^\s*(?:dbg!|println!|eprintln!|print!|eprint!)\s*\([^]*\)\s*;?\s*$/.test(line) && balanced(line) ? { remove: true } : null),
};

module.exports = { FIXERS, balanced };
