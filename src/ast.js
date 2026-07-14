'use strict';

// Opt-in AST analysis (`--ast`). Parsers are OPTIONAL peer dependencies loaded
// lazily, so importing this module never fails when they're absent and the core
// scanner stays zero-runtime-dependency:
//   • @babel/parser  → JS + JSX + TypeScript (.ts/.tsx/.jsx/.mts/.cts and JS)
//   • acorn          → plain JS fallback (.js/.mjs/.cjs) if Babel isn't installed
// Delivers the accurate function-level metrics regex can't: real cyclomatic
// complexity, function length, nesting depth, and parameter count.

const JS_EXTS = new Set(['.js', '.mjs', '.cjs']);
const TS_JSX_EXTS = new Set(['.ts', '.tsx', '.jsx', '.mts', '.cts']);
const LONG_FN = 60;      // body lines
const HIGH_CC = 15;      // cyclomatic complexity
const DEEP_NEST = 4;     // control-structure nesting depth
const MANY_PARAMS = 5;   // parameters

let babelCache;
let acornCache;
function loadBabel() {
  if (babelCache !== undefined) return babelCache;
  try { babelCache = require('@babel/parser'); } catch { babelCache = null; }
  return babelCache;
}
function loadAcorn() {
  if (acornCache !== undefined) return acornCache;
  try { acornCache = require('acorn'); } catch { acornCache = null; }
  return acornCache;
}
// True if AST analysis is possible for at least JS.
const astAvailable = () => loadBabel() !== null || loadAcorn() !== null;
const tsAvailable = () => loadBabel() !== null;

// Function-like nodes across ESTree (acorn) and Babel: Babel emits ClassMethod /
// ObjectMethod for methods instead of MethodDefinition→FunctionExpression.
const isFn = (n) => n && (
  n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression'
  || n.type === 'ArrowFunctionExpression' || n.type === 'ClassMethod' || n.type === 'ObjectMethod'
);
const NEST_TYPES = new Set(['IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'TryStatement']);
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'parent', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens', 'extra']);

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
    lines: (fn.loc.end.line - fn.loc.start.line) + 1, line: fn.loc.start.line,
  };
}

function collectFunctions(ast) {
  const fns = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node.type) return;
    if (isFn(node) && node.body) fns.push(node);
    for (const k in node) { if (SKIP_KEYS.has(k)) continue; const c = node[k]; if (c && typeof c === 'object') walk(c); }
  }(ast));
  return fns;
}

// Parse a source file with the best available parser for its extension.
function parse(source, ext) {
  const babel = loadBabel();
  if (babel) {
    const plugins = ['jsx'];
    if (ext === '.ts' || ext === '.tsx' || ext === '.mts' || ext === '.cts') plugins.push('typescript');
    try {
      return babel.parse(source, { sourceType: 'module', errorRecovery: true, allowReturnOutsideFunction: true, plugins });
    } catch { /* fall through to acorn for plain JS */ }
  }
  if (JS_EXTS.has(ext)) {
    const acorn = loadAcorn();
    if (!acorn) return null;
    const opts = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
    try { return acorn.parse(source, { ...opts, sourceType: 'module' }); }
    catch { try { return acorn.parse(source, { ...opts, sourceType: 'script' }); } catch { return null; } }
  }
  return null;
}

// Parse + analyze one source file; returns findings via the shared metaFinding builder.
function analyzeFile(source, ext, file, metaFinding) {
  if (!JS_EXTS.has(ext) && !TS_JSX_EXTS.has(ext)) return [];
  const ast = parse(source, ext);
  if (!ast || !ast.loc) return [];
  const findings = [];
  try {
    for (const fn of collectFunctions(ast)) {
      if (!fn.loc) continue;
      const m = metricsOf(fn);
      if (m.lines > LONG_FN) findings.push(metaFinding('278', file, { title: `Long function (${m.lines} lines)`, line: m.line, snippet: `function body spans ${m.lines} lines` }));
      if (m.cc > HIGH_CC) findings.push(metaFinding('279', file, { title: `High cyclomatic complexity (${m.cc})`, line: m.line, snippet: `${m.cc} independent paths` }));
      if (m.maxNest > DEEP_NEST) findings.push(metaFinding('280', file, { title: `Deep nesting (depth ${m.maxNest})`, line: m.line, snippet: `control nesting depth ${m.maxNest}` }));
      if (m.params > MANY_PARAMS) findings.push(metaFinding('281', file, { title: `Too many parameters (${m.params})`, line: m.line, snippet: `${m.params} parameters` }));
    }
  } catch { /* a pathological AST (e.g. extreme nesting → stack limit) must never crash the scan */ }
  return findings;
}

module.exports = { analyzeFile, astAvailable, tsAvailable, metricsOf, collectFunctions };
