'use strict';

/**
 * Rule definitions for the slopscore scanner.
 *
 * This file is intentionally excluded from slopscore's own self-scan: a linter's
 * rule definitions necessarily contain the very strings they detect (just as
 * ESLint excludes its own test fixtures). Every rule maps to a catalog entry in
 * ANTI_SLOP_PROTOCOL.md so the runnable scanner and the agent-facing protocol
 * stay in lockstep.
 *
 * A LINE rule has: { id, title, category, severity, authority, fix,
 *   re (RegExp tested per line), exts (allowed extensions, or null = all code),
 *   skipTests (ignore *.test/spec/stories), respectComments (skip matches inside
 *   comments), and optional unless / unlessFile / unlessFileContains (RegExps that
 *   suppress the hit when they match the line / the file path / the whole file). }
 *
 * WHOLE_FILE_RULES run their RegExp against the full file text, for multi-line
 * patterns like empty catch blocks.
 */

const CODE = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'];
const STYLE = ['.css', '.scss', '.sass', '.less', '.tsx', '.jsx', '.vue', '.svelte', '.html'];
const MARKUP = ['.jsx', '.tsx', '.html', '.vue', '.svelte'];
const TS = ['.ts', '.tsx'];
const PY = ['.py'];

const LINE_RULES = [
  // ---- CATEGORY 7: code quality ----
  {
    id: '052', title: 'console.log in production path', category: 'code', severity: 'major',
    authority: 'auto', exts: CODE, skipTests: true, respectComments: true,
    re: /\bconsole\.(log|dir|table|debug)\s*\(/,
    fix: 'Remove it, or route through a real logger with levels.',
  },
  {
    id: '054', title: 'TypeScript `any`', category: 'code', severity: 'major',
    authority: 'propose', exts: TS, skipTests: false, respectComments: true,
    unlessFile: /\.d\.ts$/,
    // `catch (e: any)` is owned by rule 078 — don't double-flag the same line.
    unless: /catch\s*\(\s*\w+\s*:\s*any\b/,
    re: /(:\s*any\b|\bas\s+any\b|Record<\s*string\s*,\s*any\s*>|\[\s*key\s*:\s*string\s*\]\s*:\s*any)/,
    fix: 'Replace with the real type, `unknown` + a narrow, or a proper generic.',
  },
  {
    id: '057', title: 'TODO / FIXME / HACK marker', category: 'code', severity: 'minor',
    authority: 'flag', exts: CODE, skipTests: false, respectComments: false,
    re: /\b(TODO|FIXME|HACK|XXX)\b\s*:/,
    fix: 'Resolve it, or convert it into a tracked issue — do not silently ship debt markers.',
  },
  {
    id: '058', title: 'Hardcoded secret / API key', category: 'security', severity: 'critical',
    authority: 'flag', exts: null, skipTests: true, respectComments: false,
    re: /((api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*['"][^'"]{12,}['"]|\bsk-[A-Za-z0-9]{16,}|\bBearer\s+[A-Za-z0-9._-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN[A-Z ]*PRIVATE KEY-----)/i,
    unless: /process\.env|import\.meta\.env|getenv|REPLACE|YOUR_|example|placeholder|\*{4,}|xxxx/i,
    fix: 'Move to an env var / secret manager. A committed secret is COMPROMISED — rotate it now.',
  },
  {
    id: '069', title: 'Step-narration comment', category: 'code', severity: 'minor',
    authority: 'auto', exts: CODE, skipTests: false, respectComments: false,
    re: /\/\/\s*(step|phase)\s*\d+\s*:/i,
    fix: 'Delete numbered procedure comments; extract real sub-tasks into named functions.',
  },
  {
    id: '070', title: 'Hallucinated API method', category: 'code', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: false, respectComments: true,
    re: /(\bfetch\.(get|post|put|patch|delete)\s*\(|\bpromise\.done\s*\()/i,
    fix: 'Use the real API: fetch(url,{method}); .then()/await. These methods do not exist.',
  },
  {
    id: '071', title: 'dangerouslySetInnerHTML / .innerHTML without sanitization', category: 'security',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, severity: 'critical',
    // Assignment only (`=`, not `===` comparison). Data-flow-lite: a constant string
    // literal (`innerHTML = "static"`, `__html: "..."`) carries no user data — not XSS.
    re: /(dangerouslySetInnerHTML|\.innerHTML\s*=(?!=))/,
    unless: /DOMPurify|sanitize|__html\s*:\s*['"]|\.innerHTML\s*=\s*['"]/i,
    fix: 'Render as text, or sanitize with DOMPurify + an allowlist before injecting.',
  },
  {
    id: '072', title: 'SQL injection via template literal', category: 'security', severity: 'critical',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    // Require real SQL structure (SELECT…FROM, INSERT INTO, UPDATE…SET, DELETE FROM)
    // so plain-English copy like `Last update: ${t}` is not flagged as injection.
    re: /`[^`]*(\bSELECT\b[^`]*\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b)[^`]*\$\{/i,
    fix: 'Use parameterized queries / prepared statements. Never interpolate input into SQL.',
  },
  {
    id: '073', title: 'Auth token in localStorage', category: 'security', severity: 'critical',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /localStorage\.(set|get)Item\s*\(\s*['"`][^'"`]*(token|jwt|auth|secret)/i,
    fix: 'Store auth in httpOnly, Secure, SameSite cookies — not localStorage (XSS-readable).',
  },
  {
    id: '077', title: 'Double type assertion', category: 'code', severity: 'major',
    authority: 'propose', exts: TS, skipTests: false, respectComments: true,
    re: /\bas\s+(unknown|any)\s+as\b/,
    fix: 'Fix the real type mismatch instead of escaping through a double assertion.',
  },
  {
    id: '142', title: 'Unpinned / aliased LLM model string', category: 'supply-chain', severity: 'major',
    authority: 'propose', exts: null, skipTests: true, respectComments: false,
    // Aliased/unpinned model ids that silently move under you (gpt-4o, claude-sonnet-4,
    // gemini-1.5-pro…). Requires the id in quotes so it's a real model string, not prose.
    re: /['"](gpt-[0-9o][\w.-]*|claude-[\w.-]+|gemini-[0-9][\w.-]*|text-embedding-[\w.-]+|dall-e-[\w.-]*)['"]/i,
    fix: 'Pin an exact, current model id (with its date suffix) and move it to config/env. Confirm the id is real — aliases get deprecated and slopsquatted.',
  },
  {
    id: '136', title: 'Hollow loading state (returns null, no skeleton)', category: 'architecture',
    severity: 'minor', authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /if\s*\(\s*\w*loading\b\s*\)\s*return\s+(null|undefined)\b/i,
    fix: 'Render a skeleton or spinner while loading — returning null is the white-flash tell of an unfinished UI.',
  },

  // ---- CATEGORY 10/11: architecture & API ----
  {
    id: '099', title: 'Hardcoded localhost URL', category: 'architecture', severity: 'major',
    authority: 'auto', exts: null, skipTests: true, respectComments: true,
    re: /(https?:\/\/localhost|https?:\/\/127\.0\.0\.1)/,
    // A localhost literal used as an env-var fallback is the idiomatic dev default.
    unless: /process\.env|import\.meta\.env|getenv/i,
    fix: 'Move base URLs to env config; add them to .env.example.',
  },
  {
    id: '103', title: 'z-index 9999', category: 'architecture', severity: 'minor',
    authority: 'auto', exts: STYLE, skipTests: false, respectComments: false,
    re: /(z-index\s*:\s*9{3,}|z-\[\s*9{3,}\s*\])/,
    fix: 'Define a small z-index token scale and map elements onto it.',
  },
  {
    id: '105', title: 'location.reload() as error recovery', category: 'architecture', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /location\.reload\s*\(/,
    fix: 'Replace with real recovery: retry, reset state, or an actionable error.',
  },
  {
    id: '106', title: 'alert() / confirm() / prompt() in production', category: 'architecture',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, severity: 'minor',
    re: /(?<![\w.])(alert|confirm|prompt)\s*\(/,
    // Don't flag an LLM/AI `prompt(...)` function — that's our own audience's code.
    unless: /system|user|assistant|\bllm\b|gpt|claude|chat|message|template|completion|tokens?\b/i,
    fix: 'Replace native blocking dialogs with the app toast/dialog components.',
  },
  {
    id: '134', title: 'Stack trace exposed to client', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /(res|response)\.(json|send)\s*\([^)]*\b(err|error)\.stack\b/,
    fix: 'Return a generic message + an error id; log the trace server-side only.',
  },
  {
    id: '139', title: 'window.location navigation in an SPA', category: 'architecture', severity: 'major',
    authority: 'auto', exts: CODE, skipTests: true, respectComments: true,
    re: /window\.location\.(href\s*=|replace\s*\()/,
    fix: 'Use the router (navigate()/<Link>/router.push()); keep window.location for external URLs only.',
  },
  {
    id: '111', title: 'Destructive action via GET', category: 'api', severity: 'critical',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\.(get)\s*\(\s*['"`][^'"`]*\/(delete|remove|destroy|purge)/i,
    fix: 'Use POST/DELETE for state changes; GET must be safe and idempotent.',
  },

  // ---- CATEGORY 6: copy ----
  {
    id: '041', title: 'AI buzzword copy', category: 'copy', severity: 'major',
    authority: 'propose', exts: null, skipTests: true, respectComments: true,
    re: /\b(supercharge|harness the power|unlock your|revolutioniz\w*|next-generation|cutting-edge|state-of-the-art|game-chang\w*|seamlessly|effortlessly)\b/i,
    fix: 'Replace with a concrete, specific claim: what it does, for whom, and the real outcome.',
  },
  {
    id: '042', title: 'Lorem ipsum in source', category: 'copy', severity: 'major',
    authority: 'flag', exts: null, skipTests: true, respectComments: false,
    re: /(lorem ipsum|dolor sit amet|consectetur adipiscing)/i,
    fix: 'Replace with real copy. Flag where product knowledge is required.',
  },
  {
    id: '043', title: '"Coming soon" placeholder', category: 'copy', severity: 'major',
    authority: 'flag', exts: MARKUP, skipTests: true, respectComments: true,
    re: /(coming soon|under construction|work in progress)/i,
    fix: 'Build it, hide it, or show an honest empty state. May be a real roadmap promise — flag.',
  },
  {
    id: '044', title: 'Cute, unhelpful error message', category: 'copy', severity: 'major',
    authority: 'propose', exts: null, skipTests: true, respectComments: true,
    re: /(\boops\b|\buh oh\b|\bwhoops\b|something went wrong)/i,
    fix: 'Make errors specific and actionable: what failed, why, and the next step.',
  },
  {
    id: '046', title: '"Submit" as the only button label', category: 'copy', severity: 'minor',
    authority: 'auto', exts: MARKUP, skipTests: true, respectComments: false,
    re: /(>\s*Submit\s*<|value\s*=\s*["']Submit["'])/,
    fix: 'Name the action: "Save changes", "Create account", "Send message".',
  },
  {
    id: '047', title: '"Click here" link text', category: 'copy', severity: 'minor',
    authority: 'auto', exts: MARKUP, skipTests: true, respectComments: false,
    re: />\s*(click here|tap here)\s*</i,
    fix: 'Rewrite link text to name the destination.',
  },

  // ---- CATEGORY 1/2: visual + typography ----
  {
    id: '001', title: 'VibeCode-purple gradient', category: 'visual', severity: 'minor',
    authority: 'propose', exts: STYLE, skipTests: false, respectComments: false,
    re: /(from-(purple|violet)-\d{2,3}\s+to-(indigo|blue|purple)-\d{2,3}|linear-gradient[^;]*(purple|indigo|violet)|#7c3aed|#4f46e5|#6d28d9)/i,
    fix: 'Pick a palette with a point of view (Escape Move 1). Not lavender→indigo. Use a token.',
  },
  {
    id: '002', title: 'Sparkle / Wand AI icon', category: 'visual', severity: 'minor',
    authority: 'propose', exts: MARKUP, skipTests: false, respectComments: true,
    re: /(<Sparkles?\b|<Wand2?\b|✨)/,
    fix: 'Use an icon that names the actual action. Remove purely decorative sparkles.',
  },
  {
    id: '003', title: 'Glassmorphism (backdrop blur)', category: 'visual', severity: 'minor',
    authority: 'propose', exts: STYLE, skipTests: false, respectComments: false,
    re: /(backdrop-blur(-|\b)|backdrop-filter\s*:\s*blur)/,
    fix: 'Use a real surface-elevation scale; reserve blur for genuine overlays. Re-check contrast.',
  },
  {
    id: '012', title: 'Colored left/top border on cards (the left-border tell)', category: 'visual', severity: 'minor',
    authority: 'propose', exts: STYLE, skipTests: false, respectComments: false,
    re: /(border-[lt]-[24]\b.*\bborder-(?:[lt]-)?(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|border-(?:left|top)\s*:\s*[1-6]px\s+solid)/i,
    fix: 'Remove the accent stripe; separate cards with spacing, background and type hierarchy. Reserve a colored leading border for ONE genuine purpose (the single active/selected item).',
  },
  {
    id: '008', title: 'Animated gradient text', category: 'visual', severity: 'major',
    authority: 'propose', exts: STYLE, skipTests: false, respectComments: false,
    re: /(bg-clip-text\s+text-transparent|background-clip\s*:\s*text|-webkit-text-fill-color\s*:\s*transparent)/,
    fix: 'Set the headline in a solid, contrast-passing color. Verify contrast.',
  },
  {
    id: '020', title: 'Confetti / particle background', category: 'visual', severity: 'minor',
    authority: 'auto', exts: CODE, skipTests: false, respectComments: true,
    re: /(canvas-confetti|react-confetti|tsparticles)/,
    fix: 'Remove decorative particle systems; respect prefers-reduced-motion.',
  },

  // ---- CATEGORY 8: accessibility ----
  {
    id: '081', title: '<img> without alt', category: 'a11y', severity: 'major',
    authority: 'auto', exts: MARKUP, skipTests: true, respectComments: true,
    re: /<img\b(?:(?!alt\s*=)[^>])*>/,
    fix: 'Add descriptive alt for meaningful images; alt="" for decorative ones.',
  },
  {
    id: '082', title: 'Interactive <div>/<span>', category: 'a11y', severity: 'major',
    authority: 'auto', exts: MARKUP, skipTests: true, respectComments: true,
    re: /<(div|span)\b[^>]*\sonClick\s*=/,
    unless: /role\s*=\s*["']button["']/,
    fix: 'Use a <button> (or <a> for navigation) so keyboard + screen readers work.',
  },
  {
    id: '083', title: 'Focus removed (outline:none) without :focus-visible', category: 'a11y', severity: 'major',
    authority: 'auto', exts: STYLE, skipTests: false, respectComments: false,
    re: /(outline\s*:\s*(none|0)\b|\boutline-none\b)/,
    // Honor the rule's own promise. Don't flag when the focus ring is handled:
    //  - same file defines a focus-visible style (Tailwind `focus-visible:` or inline), or
    //  - the project defines a global `:focus-visible` reset anywhere (CSS is global).
    unlessFileContains: /focus-visible/,
    unlessProject: 'hasGlobalFocusVisible',
    fix: 'Provide a visible :focus-visible style wherever focus outline is removed.',
  },

  // ---- Expansion: more of the 150 catalog, promoted to deterministic detectors.
  // Each is tuned for low false positives; every id maps to a catalog entry.
  {
    id: '045', title: 'Exclamation-mark marketing CTA', category: 'copy', severity: 'minor',
    authority: 'propose', exts: MARKUP, skipTests: true, respectComments: false,
    re: />\s*(get started|sign up|try it|try now|learn more|join now|start free|buy now)[^<]*!\s*</i,
    fix: 'Drop the hype exclamation. State the action plainly and let the value speak.',
  },
  {
    id: '060', title: 'Placeholder component / page name', category: 'code', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\b(function|const|class)\s+(NewComponent|Component\d+|TestComponent|TempComponent|DemoPage|SamplePage|UntitledComponent)\b/,
    fix: 'Name it for what it does. Placeholder names mean the feature was never really designed.',
  },
  {
    id: '076', title: 'Placeholder value in production config', category: 'security', severity: 'major',
    authority: 'flag', exts: null, skipTests: true, respectComments: false,
    re: /(YOUR_API_KEY|YOUR_SECRET|REPLACE_ME|INSERT_YOUR|ADD_YOUR_|CHANGE_?ME|\btest123\b|example@email\.com)/i,
    fix: 'Replace placeholder defaults with real config from env. Shipping these means the wiring is unfinished.',
  },
  {
    id: '078', title: 'Overly broad exception handling', category: 'code', severity: 'major',
    authority: 'propose', exts: null, skipTests: true, respectComments: true,
    re: /(except\s*:|except\s+(Exception|BaseException)\b\s*(as\s+\w+)?\s*:|catch\s*\(\s*\w+\s*:\s*any\s*\))/,
    fix: 'Catch the specific error type you can handle; let the rest propagate with context.',
  },
  {
    id: '093', title: 'Whole-library import for one utility', category: 'code', severity: 'minor',
    authority: 'auto', exts: CODE, skipTests: true, respectComments: true,
    re: /(import\s+(_|\*\s+as\s+_)\s+from\s+['"]lodash['"]|require\(\s*['"]lodash['"]\s*\))/,
    fix: 'Import the single function (lodash/throttle) or use a native equivalent; the whole lib bloats the bundle.',
  },
  {
    id: '116', title: 'Error returned as HTTP 200', category: 'api', severity: 'major',
    authority: 'auto', exts: CODE, skipTests: true, respectComments: true,
    // Require `error:` with a value; skip the `{ success, error: null }` envelope
    // and `{ data, error }` shorthand, which are legitimate success shapes.
    re: /\.status\(\s*200\s*\)[^;]{0,80}\b(error|fail|failure)\s*:/i,
    unless: /(error|fail|failure)\s*:\s*(null|false|undefined)\b/i,
    fix: 'Return a real status (4xx/5xx). A 200 with an error body breaks every client that checks status.',
  },
  {
    id: '132', title: 'Sensitive data in URL query params', category: 'security', severity: 'major',
    authority: 'propose', exts: null, skipTests: true, respectComments: true,
    // Bare `token=` is legitimate for one-click unsubscribe / email-verify links
    // (RFC 8058) — match only unambiguous credentials.
    re: /['"`][^'"`]*[?&](password|passwd|pwd|api[_-]?key|secret|access[_-]?token|ssn)=/i,
    fix: 'Move secrets out of the URL (headers or POST body). URLs leak into logs, history, and referrers.',
  },
  {
    id: '143', title: 'Source maps shipped to production', category: 'supply-chain', severity: 'major',
    authority: 'propose', exts: null, skipTests: true, respectComments: true,
    re: /(productionBrowserSourceMaps\s*:\s*true|devtool\s*:\s*['"]source-map['"]|sourcemap\s*:\s*true)/i,
    fix: 'Disable source maps in production builds, or upload them privately to your error tracker only.',
  },
  {
    id: '144', title: 'Command injection via interpolated shell', category: 'security', severity: 'critical',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\b(exec|execSync)\s*\(\s*`[^`]*\$\{/,
    fix: 'Never interpolate input into a shell string. Use execFile/spawn with an args array; validate inputs.',
  },
  {
    id: '004', title: 'Conic / mesh gradient background', category: 'visual', severity: 'minor',
    authority: 'propose', exts: STYLE, skipTests: false, respectComments: false,
    re: /(conic-gradient|mesh-gradient)/i,
    fix: 'Decorative AI background. Use a flat surface or a palette with a point of view (Escape Move 1).',
  },
  {
    id: '022', title: 'Recycled AI-mockup font combo', category: 'visual', severity: 'minor',
    authority: 'propose', exts: STYLE, skipTests: false, respectComments: false,
    re: /(Space\s+Grotesk|Instrument\s+Serif|Plus\s+Jakarta\s+Sans)/,
    fix: 'This trio ships in countless AI mockups. Fine fonts — just confirm the choice is deliberate, not default.',
  },
  {
    id: '149', title: 'Tautological test assertion', category: 'code', severity: 'major',
    authority: 'auto', exts: CODE, skipTests: false, respectComments: true,
    re: /(expect\(\s*true\s*\)\.toBe\(\s*true\s*\)|expect\(\s*1\s*\)\.toBe\(\s*1\s*\)|assert\(\s*true\s*\)|assert\.ok\(\s*true\s*\))/,
    fix: 'Assert real behavior with real inputs. A test that can never fail is coverage theater.',
  },

  // ---- CATEGORY 17: Language-specific tells — Python ----
  {
    id: '151', title: 'Mutable default argument (Python)', category: 'code', severity: 'major',
    authority: 'propose', exts: PY, skipTests: false, respectComments: true,
    re: /def\s+\w+\s*\([^)]*=\s*[[{]/,
    fix: 'Default to None and build the list/dict inside the function — a mutable default is shared across every call.',
  },
  {
    id: '152', title: 'Comparison to None with == (Python)', category: 'code', severity: 'minor',
    authority: 'auto', exts: PY, skipTests: false, respectComments: true,
    re: /[!=]=\s*None\b/,
    fix: 'Use `is None` / `is not None` — None is a singleton; `==` can be overridden and is slower.',
  },
  {
    id: '153', title: 'eval() / exec() on dynamic input (Python)', category: 'security', severity: 'critical',
    authority: 'propose', exts: PY, skipTests: true, respectComments: true,
    re: /(?<![\w.])(eval|exec)\s*\(/,
    unless: /ast\.literal_eval/,
    fix: 'Never eval/exec dynamic input — it is arbitrary code execution. Use ast.literal_eval or a real parser.',
  },
  {
    id: '154', title: 'SQL injection via f-string (Python)', category: 'security', severity: 'critical',
    authority: 'propose', exts: PY, skipTests: true, respectComments: true,
    re: /f['"][^'"]*\b(SELECT\b[^'"]*\bFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b[^'"]*\{/i,
    fix: 'Use parameterized queries (cursor.execute(sql, params)); never f-string input into SQL.',
  },
  {
    id: '155', title: 'Command injection via os.system / shell=True (Python)', category: 'security', severity: 'critical',
    authority: 'propose', exts: PY, skipTests: true, respectComments: true,
    re: /(os\.system\s*\(\s*f['"]|os\.system\s*\([^)]*[%+]|subprocess\.\w+\([^)]*shell\s*=\s*True)/,
    fix: 'Use subprocess with an args list and shell=False; never interpolate input into a shell string.',
  },
];

// Detectors implemented as bespoke checks in scanner.js — file size, repo-level
// git/filesystem inspection — rather than a per-line regex. Their detection
// logic lives in scanner.js; their catalog metadata (id, severity, fix) lives
// here so there is ONE source of truth, `slopscore rules` lists them, and the
// advertised detector count includes them. scanner.js imports these by id.
const META_RULES = [
  {
    id: '055', title: 'God file (oversized source file)', category: 'architecture',
    severity: 'major', authority: 'propose',
    fix: 'Split by responsibility into components/hooks/services. Preserve behavior; do it on a branch.',
  },
  {
    id: '068', title: 'Copy-pasted duplicated code block', category: 'code',
    severity: 'major', authority: 'propose',
    fix: 'Extract the shared logic into a function/component/hook. This is the refactor AI skips — and the duplication that quietly multiplies every future bug fix.',
  },
  {
    id: '061', title: 'Versioned duplicate file', category: 'code',
    severity: 'major', authority: 'propose',
    fix: 'Identify the live file, confirm nothing imports the copies, delete them; rely on git history.',
  },
  {
    id: '079', title: 'Dependency bloat', category: 'supply-chain',
    severity: 'major', authority: 'propose',
    fix: 'Remove unused/duplicate-purpose deps (knip/depcheck); each is bundle + CVE surface.',
  },
  {
    id: '080', title: 'Thin / placeholder README', category: 'code',
    severity: 'minor', authority: 'propose',
    fix: 'Write a real README: what it is, install, run, key scripts, one-paragraph architecture.',
  },
  {
    id: '107', title: '.env committed to the repository', category: 'security',
    severity: 'critical', authority: 'flag',
    fix: 'gitignore it AND rotate every secret it contained (they are compromised); scrub git history.',
  },
];

const META = Object.fromEntries(META_RULES.map((r) => [r.id, r]));

const WHOLE_FILE_RULES = [
  {
    id: '053', title: 'Empty catch block (silent error swallowing)', category: 'code', severity: 'critical',
    authority: 'propose', exts: CODE, skipTests: true,
    re: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    fix: 'At minimum log with context; better, handle or rethrow and surface a real message.',
  },
  {
    id: '065', title: 'setTimeout used to paper over a race condition', category: 'code', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true,
    re: /setTimeout\s*\([^,]{1,80},\s*[1-9]\d{2,}\s*\)/g,
    fix: 'Fix the real ordering (await the promise, use lifecycle/refs) instead of a magic delay.',
  },
];

module.exports = { LINE_RULES, WHOLE_FILE_RULES, META_RULES, META, CODE, STYLE, MARKUP, TS };
