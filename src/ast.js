'use strict';

// Opt-in AST analysis (`--ast`). Uses acorn — an OPTIONAL peer dependency — loaded
// lazily so importing this module never fails when acorn isn't installed and the
// core stays zero-runtime-dependency. Delivers the accurate function-level metrics
// regex can't: real cyclomatic complexity, function length, nesting depth, and
// parameter count (control blocks are never mistaken for functions).
//
// JS / mjs / cjs only for now; TS/JSX files that acorn can't parse are skipped
// silently (a future increment can add a TS parser behind the same opt-in).

const JS_EXTS = new Set(['.js', '.mjs', '.cjs']);
const LONG_FN = 60;      // body lines
const HIGH_CC = 15;      // cyclomatic complexity
const DEEP_NEST = 4;     // control-structure nesting depth
const MANY_PARAMS = 5;   // parameters

let acornCache; // undefined = not tried; null = unavailable; object = the module
function loadAcorn() {
  if (acornCache !== undefined) return acornCache;
  try { acornCache = require('acorn'); } catch { acornCache = null; }
  return acornCache;
}
const astAvailable = () => loadAcorn() !== null;

const isFn = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const NEST_TYPES = new Set(['IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'TryStatement']);
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'parent']);

// Metrics for ONE function — decision points and nesting within its own body,
// NOT descending into nested functions (those are analyzed separately).
function metricsOf(fn) {
  let cc = 1;
  let maxNest = 0;
  (function visit(node, depth) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const c of node) visit(c, depth); return; }
    if (!node.type) return;
    if (node.type === 'IfStatement' || node.type === 'ForStatement' || node.type === 'ForInStatement'
      || node.type === 'ForOfStatement' || node.type === 'WhileStatement' || node.type === 'DoWhileStatement'
      || node.type === 'CatchClause') cc += 1;
    else if (node.type === 'SwitchCase' && node.test) cc += 1;
    else if (node.type === 'ConditionalExpression') cc += 1;
    else if (node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||' || node.operator === '??')) cc += 1;
    const depth2 = NEST_TYPES.has(node.type) ? depth + 1 : depth;
    if (depth2 > maxNest) maxNest = depth2;
    for (const k in node) {
      if (SKIP_KEYS.has(k)) continue;
      const child = node[k];
      if (child && typeof child === 'object' && !isFn(child)) visit(child, depth2);
    }
  }(fn.body, 0));
  return {
    cc, maxNest, params: (fn.params || []).length,
    lines: fn.loc.end.line - fn.loc.start.line + 1, line: fn.loc.start.line,
  };
}

function collectFunctions(ast) {
  const fns = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node.type) return;
    if (isFn(node)) fns.push(node);
    for (const k in node) { if (SKIP_KEYS.has(k)) continue; const c = node[k]; if (c && typeof c === 'object') walk(c); }
  }(ast));
  return fns;
}

// Parse + analyze one source file; returns findings via the shared metaFinding builder.
function analyzeFile(source, ext, file, metaFinding) {
  if (!JS_EXTS.has(ext)) return [];
  const acorn = loadAcorn();
  if (!acorn) return [];
  const opts = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
  let ast;
  try { ast = acorn.parse(source, { ...opts, sourceType: 'module' }); }
  catch { try { ast = acorn.parse(source, { ...opts, sourceType: 'script' }); } catch { return []; } }

  const findings = [];
  for (const fn of collectFunctions(ast)) {
    const m = metricsOf(fn);
    if (m.lines > LONG_FN) findings.push(metaFinding('278', file, { title: `Long function (${m.lines} lines)`, line: m.line, snippet: `function body spans ${m.lines} lines` }));
    if (m.cc > HIGH_CC) findings.push(metaFinding('279', file, { title: `High cyclomatic complexity (${m.cc})`, line: m.line, snippet: `${m.cc} independent paths` }));
    if (m.maxNest > DEEP_NEST) findings.push(metaFinding('280', file, { title: `Deep nesting (depth ${m.maxNest})`, line: m.line, snippet: `control nesting depth ${m.maxNest}` }));
    if (m.params > MANY_PARAMS) findings.push(metaFinding('281', file, { title: `Too many parameters (${m.params})`, line: m.line, snippet: `${m.params} parameters` }));
  }
  return findings;
}

module.exports = { analyzeFile, astAvailable, metricsOf, collectFunctions };
