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
const CLONE_MIN_NODES = 30; // min structural size for a function to be clone-checked
const crypto = require('crypto');

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

// Structural fingerprint of a function: the sequence of AST node TYPES in its body
// (identifiers/literals contribute their type but not their name/value), so a
// copy-pasted-then-renamed function hashes identically. null for small functions.
function fingerprintFn(fn) {
  const types = [];
  walkNoFn(fn.body, (n) => { if (n.type) types.push(n.type); });
  if (types.length < CLONE_MIN_NODES) return null;
  return crypto.createHash('sha1').update(types.join(',')).digest('hex').slice(0, 16);
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

// ---- intra-procedural taint analysis (detector 282, opt-in via --ast) ----
// Tracks user input from a SOURCE, through variable assignments, into a dangerous
// SINK — the cross-variable flow a per-line regex can't see. Deliberately ADDITIVE:
// it fires only when a tainted VARIABLE reaches a sink (a direct inline `req.x`
// stays with the regex rules 253/254/144/072…), so the two never double-report.

// A MemberExpression rooted at a user-controlled source.
function isSource(node) {
  if (!node || node.type !== 'MemberExpression') return false;
  const path = [];
  let n = node;
  while (n && n.type === 'MemberExpression') { if (n.property && n.property.type === 'Identifier') path.unshift(n.property.name); n = n.object; }
  const root = n && n.type === 'Identifier' ? n.name : null;
  if (root === 'req' || root === 'request') return true;
  if (root === 'process' && (path[0] === 'argv' || path[0] === 'env')) return true;
  if (root === 'location') return true;
  if (root === 'window' && path[0] === 'location') return true;
  if (root === 'document' && (path[0] === 'cookie' || path[0] === 'referrer' || path[0] === 'URL')) return true;
  return false;
}

// Walk a subtree without descending into nested functions (per-function scope).
function walkNoFn(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const c of node) walkNoFn(c, visit); return; }
  if (!node.type) return;
  visit(node);
  for (const k in node) {
    if (SKIP_KEYS.has(k)) continue;
    const child = node[k];
    if (child && typeof child === 'object' && !isFn(child)) walkNoFn(child, visit);
  }
}

// Does the expression carry taint (a source OR an already-tainted var)? Used to
// PROPAGATE taint through assignments.
function exprHasTaint(node, tainted) {
  if (!node || typeof node !== 'object') return false;
  switch (node.type) {
    case 'Identifier': return tainted.has(node.name);
    case 'MemberExpression': return isSource(node) || exprHasTaint(node.object, tainted);
    case 'CallExpression': return (node.arguments || []).some((a) => exprHasTaint(a, tainted)) || exprHasTaint(node.callee, tainted);
    case 'TemplateLiteral': return (node.expressions || []).some((e) => exprHasTaint(e, tainted));
    case 'BinaryExpression': case 'LogicalExpression': return exprHasTaint(node.left, tainted) || exprHasTaint(node.right, tainted);
    case 'ConditionalExpression': return exprHasTaint(node.consequent, tainted) || exprHasTaint(node.alternate, tainted);
    case 'AwaitExpression': return exprHasTaint(node.argument, tainted);
    case 'ArrayExpression': return (node.elements || []).some((e) => exprHasTaint(e, tainted));
    default: return false;
  }
}

// Does the expression reach a tainted VARIABLE (not a direct source member)? Used
// at SINKS so 282 only reports cross-variable flows (regex owns the inline case).
function containsTaintedVar(node, tainted) {
  if (!node || typeof node !== 'object') return false;
  switch (node.type) {
    case 'Identifier': return tainted.has(node.name);
    case 'MemberExpression': return containsTaintedVar(node.object, tainted);
    case 'CallExpression': return (node.arguments || []).some((a) => containsTaintedVar(a, tainted)) || containsTaintedVar(node.callee, tainted);
    case 'TemplateLiteral': return (node.expressions || []).some((e) => containsTaintedVar(e, tainted));
    case 'BinaryExpression': case 'LogicalExpression': return containsTaintedVar(node.left, tainted) || containsTaintedVar(node.right, tainted);
    case 'ConditionalExpression': return containsTaintedVar(node.consequent, tainted) || containsTaintedVar(node.alternate, tainted);
    case 'AwaitExpression': return containsTaintedVar(node.argument, tainted);
    case 'ArrayExpression': return (node.elements || []).some((e) => containsTaintedVar(e, tainted));
    default: return false;
  }
}

// Names bound by an assignment target (handles destructuring).
function bindNames(pat) {
  const out = [];
  (function rec(p) {
    if (!p) return;
    if (p.type === 'Identifier') out.push(p.name);
    else if (p.type === 'ObjectPattern') for (const pr of p.properties || []) rec(pr.value || pr.argument);
    else if (p.type === 'ArrayPattern') for (const el of p.elements || []) rec(el);
    else if (p.type === 'AssignmentPattern') rec(p.left);
    else if (p.type === 'RestElement') rec(p.argument);
  }(pat));
  return out;
}

// Fixpoint set of tainted variable names within one function body.
function taintedVars(body) {
  const tainted = new Set();
  const assigns = [];
  walkNoFn(body, (node) => {
    if (node.type === 'VariableDeclarator' && node.init) assigns.push({ id: node.id, value: node.init });
    else if (node.type === 'AssignmentExpression' && node.operator === '=') assigns.push({ id: node.left, value: node.right });
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of assigns) {
      if (exprHasTaint(a.value, tainted)) {
        for (const name of bindNames(a.id)) if (name && !tainted.has(name)) { tainted.add(name); changed = true; }
      }
    }
  }
  return tainted;
}

function calleeName(call) {
  const c = call.callee;
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && c.property && c.property.type === 'Identifier') return c.property.name;
  return null;
}
// Sinks NOT already caught unconditionally by a per-line regex on the sink line.
// (eval/new Function are excluded — rule 172 flags them regardless of taint.)
const SINK_ALL = { exec: 'shell command (injection)', execSync: 'shell command (injection)', redirect: 'HTTP redirect (open redirect)', readFile: 'filesystem path (traversal)', readFileSync: 'filesystem path (traversal)', createReadStream: 'filesystem path (traversal)', createWriteStream: 'filesystem path (traversal)', sendFile: 'filesystem path (traversal)', writeFile: 'filesystem path (traversal)', writeFileSync: 'filesystem path (traversal)', unlink: 'filesystem path (traversal)', unlinkSync: 'filesystem path (traversal)' };
const SINK_SQL = new Set(['query', 'execute', 'raw']);

function taintFindings(fn, file, metaFinding) {
  const out = [];
  const tainted = taintedVars(fn.body);
  if (tainted.size === 0) return out;
  const at = (node) => (node.loc && node.loc.start.line) || 1;
  walkNoFn(fn.body, (node) => {
    if (node.type === 'CallExpression') {
      const name = calleeName(node);
      if (!name) return;
      if (SINK_ALL[name] && (node.arguments || []).some((a) => containsTaintedVar(a, tainted))) {
        out.push(metaFinding('282', file, { title: `Tainted input reaches a sink — ${SINK_ALL[name]}`, line: at(node), snippet: `a user-derived variable flows into ${name}()` }));
      } else if (SINK_SQL.has(name) && node.arguments && node.arguments[0] && containsTaintedVar(node.arguments[0], tainted)) {
        // arg[0] only — a value passed in the params array (parameterized query) is safe.
        out.push(metaFinding('282', file, { title: 'Tainted input reaches a SQL query (injection)', line: at(node), snippet: `a user-derived variable is the query string of .${name}()` }));
      }
    } else if (node.type === 'AssignmentExpression' && node.left && node.left.type === 'MemberExpression'
      && node.left.property && node.left.property.type === 'Identifier' && node.left.property.name === 'innerHTML'
      && containsTaintedVar(node.right, tainted)) {
      out.push(metaFinding('282', file, { title: 'Tainted input reaches innerHTML (XSS)', line: at(node), snippet: 'a user-derived variable is assigned to .innerHTML' }));
    } else if (node.type === 'AssignmentExpression' && node.left && node.left.type === 'MemberExpression'
      && node.left.computed && containsTaintedVar(node.left.property, tainted)) {
      // obj[taintedKey] = value → prototype pollution (attacker controls the property name)
      out.push(metaFinding('282', file, { title: 'Tainted key in a dynamic property assignment (prototype pollution)', line: at(node), snippet: 'a user-derived variable is used as an assignment key (obj[key] = …)' }));
    }
  });
  return out;
}

// Parse + analyze one source file; returns findings via the shared metaFinding builder.
function analyzeFile(source, ext, file, metaFinding, cloneIndex) {
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
      for (const f of taintFindings(fn, file, metaFinding)) findings.push(f);
      if (cloneIndex) {
        const h = fingerprintFn(fn);
        if (h) { if (!cloneIndex.has(h)) cloneIndex.set(h, []); cloneIndex.get(h).push({ file, line: fn.loc.start.line }); }
      }
    }
  } catch { /* a pathological AST (e.g. extreme nesting → stack limit) must never crash the scan */ }
  return findings;
}

module.exports = { analyzeFile, astAvailable, tsAvailable, metricsOf, collectFunctions, cloneFindings };

// Emit 286 for functions whose structural fingerprint appears in 2+ DIFFERENT files
// (copy-paste across the codebase). zoneOf tags each clone site's zone.
function cloneFindings(cloneIndex, metaFinding, zoneOf) {
  const out = [];
  for (const [, locs] of cloneIndex) {
    const fileSet = new Set(locs.map((l) => l.file));
    if (fileSet.size < 2) continue;
    for (const l of locs) {
      const f = metaFinding('286', l.file, {
        title: `Structural clone (function duplicated across ${fileSet.size} files)`,
        line: l.line, snippet: `structurally identical to ${locs.length - 1} other function(s)`,
      });
      f.zone = zoneOf(l.file);
      out.push(f);
    }
  }
  return out;
}
