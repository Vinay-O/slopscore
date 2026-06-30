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
const STYLE = ['.css', '.scss', '.sass', '.less', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.html'];
const MARKUP = ['.jsx', '.tsx', '.html', '.vue', '.svelte'];
const TS = ['.ts', '.tsx'];
const PY = ['.py'];
const GO = ['.go'];
const RUST = ['.rs'];

const LINE_RULES = [
  // ---- CATEGORY 7: code quality ----
  {
    id: '052', title: 'console.log in production path', category: 'code', severity: 'major',
    authority: 'auto', exts: CODE, skipTests: true, respectComments: true, eslint: 'no-console',
    re: /\bconsole\.(log|dir|table|debug)\s*\(/,
    fix: 'Remove it, or route through a real logger with levels.',
  },
  {
    id: '054', title: 'TypeScript `any`', category: 'code', severity: 'major',
    authority: 'propose', exts: TS, skipTests: false, respectComments: true,
    eslint: '@typescript-eslint/no-explicit-any',
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
    authority: 'propose', exts: null, skipTests: true, respectComments: false, confidence: 'medium',
    // Aliased/unpinned model ids that silently move under you (gpt-4o, claude-sonnet-4,
    // gemini-1.5-pro…). Requires the id in quotes so it's a real model string, not prose.
    re: /['"](gpt-[0-9o][\w.-]*|claude-[\w.-]+|gemini-[0-9][\w.-]*|text-embedding-[\w.-]+|dall-e-[\w.-]*)['"]/i,
    // A date-pinned id (…-20241022 / …-2024-08-06) is exactly the recommended
    // practice — never flag it.
    unless: /-\d{8}\b|-\d{4}-\d{2}-\d{2}\b/,
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
    // The global call only — not a method (lookbehind on `.`) and not a function or
    // method DEFINITION / signature named confirm/prompt (the app's own dialog wrapper).
    re: /(?<![\w.])(?<!function\s)(alert|confirm|prompt)\s*\((?![^)]*\)\s*[:{])/,
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
    // Three idioms for the same lavender→indigo tell:
    //  - Tailwind gradient classes (from-purple-500 to-indigo-500)
    //  - any-CSS gradient (CSS, CSS-in-JS, MUI sx, styled/emotion — no semicolon
    //    required) whose stops name a purple word OR a Tailwind violet/indigo/purple hex
    //  - the three classic bare hexes, kept for back-compat
    re: /(from-(purple|violet)-\d{2,3}\s+to-(indigo|blue|purple)-\d{2,3}|(?:linear|radial|conic)-gradient\([^)]*(purple|indigo|violet|#(?:a78bfa|8b5cf6|7c3aed|6d28d9|818cf8|6366f1|4f46e5|4338ca|c084fc|a855f7|9333ea|7e22ce))|#7c3aed|#4f46e5|#6d28d9)/i,
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
    // Tailwind class, CSS property, AND CSS-in-JS camelCase (MUI sx, styled, emotion):
    // backdropFilter: "blur(12px)" / WebkitBackdropFilter: 'blur(...)'.
    re: /(backdrop-blur(-|\b)|backdrop-filter\s*:\s*blur|(?:Webkit)?[bB]ackdropFilter\s*:\s*['"`]?\s*blur)/,
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
    // Tailwind, CSS, AND CSS-in-JS camelCase (MUI sx, styled, emotion):
    // WebkitBackgroundClip: 'text' + WebkitTextFillColor: 'transparent'.
    re: /(bg-clip-text\s+text-transparent|background-clip\s*:\s*text|-webkit-text-fill-color\s*:\s*transparent|(?:Webkit)?[bB]ackgroundClip\s*:\s*['"`]text|WebkitTextFillColor\s*:\s*['"`]transparent)/,
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
    // Python `except`/`except Exception:` are always statement-leading, so anchor
    // those branches to line start — otherwise a JS object key like `except: x`
    // reads as a bare except. The `catch (e: any)` branch stays unanchored (it's
    // mid-line after `} `).
    re: /(^\s*except\s*:|^\s*except\s+(Exception|BaseException)\b\s*(as\s+\w+)?\s*:|catch\s*\(\s*\w+\s*:\s*any\s*\))/,
    fix: 'Catch the specific error type you can handle; let the rest propagate with context.',
  },
  {
    id: '093', title: 'Whole-library import for one utility', category: 'performance', severity: 'minor',
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
    // SQLAlchemy / Django ORM build SQL (`IS NULL`) with `Column == None` inside a
    // .filter()/.where() — that's required, not slop. Don't flag those lines.
    unless: /\.(filter|where|having|exclude)\s*\(|filter_by\s*\(/,
    fix: 'Use `is None` / `is not None` — None is a singleton; `==` can be overridden and is slower.',
  },
  {
    id: '153', title: 'eval() / exec() on dynamic input (Python)', category: 'security', severity: 'critical',
    authority: 'propose', exts: PY, skipTests: true, respectComments: true,
    // The builtin call only — not a method (`.eval()`) and not a method/function
    // DEFINITION named eval/exec (`def eval(self):` — e.g. a model's eval mode).
    re: /(?<![\w.])(?<!def\s)(eval|exec)\s*\(/,
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

  // ---- CATEGORY 17: Language-specific tells — Go ----
  {
    id: '156', title: 'Empty interface{} overuse (Go)', category: 'code', severity: 'major',
    authority: 'propose', exts: GO, skipTests: true, respectComments: true,
    re: /\binterface\s*\{\s*\}/,
    fix: 'Use a concrete type or a generic (Go 1.18+ type parameter); interface{} discards type safety.',
  },
  {
    id: '157', title: 'Ignored error return (Go)', category: 'code', severity: 'major',
    authority: 'propose', exts: GO, skipTests: true, respectComments: true,
    re: /,\s*_\s*:?=\s*[a-zA-Z_][\w.]*\(/,
    unless: /\brange\b|\.\(/,
    fix: 'Handle the error (check, wrap, or return it). Discarding it with _ hides real failures.',
  },
  {
    id: '158', title: 'fmt.Print debugging (Go)', category: 'code', severity: 'minor',
    authority: 'propose', exts: GO, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\bfmt\.Print(ln|f)?\s*\(/,
    fix: 'For diagnostics use log / a structured logger with levels. (Leave it if this is the program\'s real output.)',
  },
  {
    id: '159', title: 'Command injection via exec sh -c (Go)', category: 'security', severity: 'critical',
    authority: 'propose', exts: GO, skipTests: true, respectComments: true,
    re: /exec\.Command\s*\(\s*['"](sh|bash|cmd|powershell)['"]\s*,\s*['"][-/]?[cC]['"]/,
    fix: 'Call the program directly: exec.Command(prog, arg1, arg2). Never build a shell string from input.',
  },

  // ---- CATEGORY 17: Language-specific tells — Rust ----
  {
    id: '160', title: '.unwrap() / .expect() (Rust)', category: 'code', severity: 'major',
    authority: 'propose', exts: RUST, skipTests: true, respectComments: true,
    re: /\.unwrap\(\)|\.expect\s*\(/,
    fix: 'Handle the Result/Option: `?`, match, or `.unwrap_or`/`.ok_or`. unwrap panics in production.',
  },
  {
    id: '161', title: 'todo!() / unimplemented!() / panic!() (Rust)', category: 'code', severity: 'major',
    authority: 'flag', exts: RUST, skipTests: true, respectComments: true,
    re: /\b(todo!|unimplemented!|unreachable!|panic!)\s*\(/,
    fix: 'todo!/unimplemented! is an unbuilt path that panics at runtime — finish it or flag the gap; replace panic! with real error handling.',
  },
  {
    id: '162', title: 'unsafe block (Rust)', category: 'security', severity: 'major',
    authority: 'flag', exts: RUST, skipTests: true, respectComments: true,
    re: /\bunsafe\s*\{/,
    fix: 'Justify every unsafe block with a comment proving the invariants, or replace it with safe code. Needs human review.',
  },

  // ---- CATEGORY 14 expansion: security hardening (163–174) ----
  {
    id: '163', title: 'TLS / certificate verification disabled', category: 'security', severity: 'critical',
    authority: 'propose', exts: null, skipTests: true, respectComments: true,
    // The unambiguous TLS-bypass signals, plus Python `verify=False` ONLY when it's
    // clearly an HTTP request — a known client lib on the line, a `.get(…verify=False)`
    // method call, `.verify = False`, or aiohttp's unambiguous `verify_ssl=False`. A
    // generic param like `def active(session, verify=False)` is NOT flagged (`session`
    // is far too common a name to treat as a TLS signal).
    re: /(rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*[=:]\s*['"]?0|InsecureSkipVerify\s*:\s*true|ssl\._create_unverified_context|CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*,\s*(?:0|false)|verify_ssl\s*=\s*False\b|\.verify\s*=\s*False\b|\b(?:requests|httpx|aiohttp|urllib3)\b[^\n]*\bverify\s*=\s*False\b|\.(?:get|post|put|delete|patch|request|head|send|Session|Client)\s*\([^\n]*\bverify\s*=\s*False\b)/,
    fix: 'Never disable certificate verification. Fix the trust store / cert chain; for local dev use a real local CA (mkcert), not a global bypass.',
  },
  {
    id: '164', title: 'Weak hash (MD5 / SHA-1) for security', category: 'security', severity: 'major',
    authority: 'propose', exts: null, skipTests: true, respectComments: true, confidence: 'medium',
    // Only when a security word shares the line — md5/sha1 for a cache key / ETag /
    // content fingerprint is fine, so a blanket flag would be noise.
    re: /(?:createHash\s*\(\s*['"](?:md5|sha1)['"]|hashlib\.(?:md5|sha1)\s*\(|MessageDigest\.getInstance\s*\(\s*['"](?:MD5|SHA-?1)['"])[^\n]*\b(?:password|passwd|secret|token|signature|sign|auth|credential|hmac|salt)\b|\b(?:password|passwd|secret|token|credential|signature)\w*\b[^\n]*(?:createHash\s*\(\s*['"](?:md5|sha1)|hashlib\.(?:md5|sha1)\s*\()/i,
    fix: 'MD5/SHA-1 are broken for security. Use SHA-256+ for integrity and bcrypt/scrypt/argon2 for passwords. (Fine for non-security checksums.)',
  },
  {
    id: '165', title: 'Insecure randomness for a security value', category: 'security', severity: 'critical',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /(Math\.random\([^)]*\)[^\n]*\b(token|secret|password|passwd|otp|nonce|salt|sessionid|session_id|api[_-]?key|csrf|reset)\b|\b(token|secret|password|passwd|otp|nonce|salt|sessionid|session_id|api[_-]?key|csrf|reset)\w*\s*[=:][^\n]*Math\.random\()/i,
    fix: 'Math.random() is not cryptographically secure. Use crypto.randomBytes / crypto.randomUUID / getRandomValues for any security value.',
  },
  {
    id: '166', title: 'Hardcoded private key in source', category: 'security', severity: 'critical',
    authority: 'flag', exts: null, skipTests: true, respectComments: false,
    re: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+|PGP\s+)?PRIVATE\s+KEY-----/,
    fix: 'Remove the private key from source and rotate it now (it is compromised). Load keys from a secret manager / env at runtime.',
  },
  {
    id: '167', title: 'Insecure deserialization (Python)', category: 'security', severity: 'critical',
    authority: 'propose', exts: PY, skipTests: true, respectComments: true,
    re: /(\bpickle\.loads?\s*\(|\bcPickle\.loads?\s*\(|\bmarshal\.loads?\s*\(|\byaml\.load\s*\((?![^)]*Loader\s*=))/,
    fix: 'Never deserialize untrusted data with pickle/marshal/yaml.load. Use yaml.safe_load; for interchange use JSON.',
  },
  {
    id: '168', title: 'Wildcard CORS origin', category: 'security', severity: 'major',
    authority: 'propose', exts: null, skipTests: true, respectComments: true,
    re: /(Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*|\borigin\s*:\s*['"]\*['"])/i,
    fix: 'Don\'t reflect a wildcard origin on anything with credentials or state. Allow-list explicit origins.',
  },
  {
    id: '169', title: 'target="_blank" without rel="noopener"', category: 'security', severity: 'major',
    authority: 'auto', exts: MARKUP, skipTests: true, respectComments: true,
    re: /<a\b[^>]*\btarget\s*=\s*['"]_blank['"][^>]*>/i,
    unless: /\brel\s*=\s*['"][^'"]*noopener/i,
    fix: 'Add rel="noopener noreferrer" — a target="_blank" link otherwise lets the opened page reach window.opener (reverse tabnabbing).',
  },
  {
    id: '170', title: 'Credentials in a connection string', category: 'security', severity: 'critical',
    authority: 'flag', exts: null, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|redis|amqps?|ftp|ldaps?):\/\/[^\s:'"/]+:[^\s:'"@/]+@/i,
    fix: 'Move the username/password out of the URL into env / a secret manager. An inline password leaks into logs, history, and process listings.',
  },
  {
    id: '171', title: 'SQL built by string concatenation', category: 'security', severity: 'critical',
    authority: 'propose', exts: null, skipTests: true, respectComments: true, confidence: 'medium',
    // Require real SQL structure inside the quoted string adjacent to a `+`, so a
    // plain-English concat like `name + " and " + surname` is never mistaken for
    // injection. (A generic `+ "WHERE…"` branch was too eager — dropped.)
    re: /['"][^'"]*\b(?:SELECT\b[^'"]*\bFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b[^'"]*['"]\s*\+/i,
    fix: 'Use parameterized queries / prepared statements. Never build SQL by concatenating input.',
  },
  {
    id: '172', title: 'eval() / new Function() on dynamic input', category: 'security', severity: 'critical',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    // Match the global eval(...) call only — NOT a method call like model.eval()
    // (leading `.`/word), NOT a function/method DEFINITION or TS signature named eval
    // (`function eval(`, `eval(params) {`, `eval(ctx): boolean`).
    re: /(?<![.\w$])(?<!function\s)eval\s*\((?![^)]*\)\s*[:{])|new\s+Function\s*\(/,
    fix: 'Avoid eval / new Function — it is arbitrary code execution. Use JSON.parse, a lookup table, or a real parser.',
  },
  {
    id: '173', title: 'Cleartext HTTP for a network call', category: 'security', severity: 'major',
    authority: 'propose', exts: null, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\b(?:fetch|axios(?:\.\w+)?|requests\.(?:get|post|put|delete|patch)|http\.(?:get|request))\s*\(\s*['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/i,
    fix: 'Use HTTPS. Cleartext HTTP exposes data and tokens to anyone on the network path.',
  },
  {
    id: '174', title: 'JWT signature not verified', category: 'security', severity: 'critical',
    authority: 'propose', exts: null, skipTests: true, respectComments: true,
    re: /(algorithms?\s*[=:]\s*\[?\s*['"]none['"]|jwt\.decode\s*\([^)]*verify\s*=\s*False|\.verify\s*\([^)]*algorithms?\s*:\s*\[\s*['"]none['"])/i,
    fix: 'Always verify JWT signatures against a fixed allow-list of strong algorithms. Never allow "none" or verify=False.',
  },

  // ---- CATEGORY 9 expansion: performance (175–177) ----
  {
    id: '175', title: 'Deep clone via JSON round-trip', category: 'performance', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/,
    fix: 'Use structuredClone() (or a targeted copy). JSON.parse(JSON.stringify(x)) is slow and silently drops Dates, Maps, Sets, undefined, and functions.',
  },
  {
    id: '176', title: 'SELECT * over-fetch', category: 'performance', severity: 'minor',
    authority: 'propose', exts: null, skipTests: true, respectComments: true, confidence: 'medium',
    // All-upper or all-lower only (the two real SQL conventions). Title-case
    // "Select * from the menu" is prose, not a query — don't flag it.
    re: /\bSELECT\s+\*\s+FROM\b|\bselect\s+\*\s+from\b/,
    fix: 'Select only the columns you use. SELECT * over-fetches rows, breaks on schema changes, and defeats covering indexes.',
  },
  {
    id: '177', title: 'forEach with an async callback', category: 'performance', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\.forEach\s*\(\s*async\b/,
    fix: 'forEach ignores returned promises — they run unawaited and errors are swallowed. Use for...of with await, or Promise.all(items.map(...)).',
  },

  // ---- CATEGORY 17 expansion: deeper language coverage (178–181) ----
  {
    id: '178', title: 'print() debugging (Python)', category: 'code', severity: 'major',
    authority: 'propose', exts: PY, skipTests: true, respectComments: true, confidence: 'medium',
    // The builtin print only — not a `.print()` method call, not a `def print(` method.
    re: /(?<![\w.])(?<!def\s)print\s*\(/,
    fix: 'Use the logging module (logger.debug/info) for levelled output you can turn off. Remove stray debug prints.',
  },
  {
    id: '179', title: '== True / == False comparison (Python)', category: 'code', severity: 'minor',
    authority: 'propose', exts: PY, skipTests: true, respectComments: true,
    re: /[!=]=\s*(True|False)\b/,
    // ORM filter expressions (`Column == True`) compile to SQL `= true` — required.
    unless: /\.(filter|where|having|exclude)\s*\(|filter_by\s*\(/,
    fix: 'Compare by truthiness: `if x:` / `if not x:`. `== True` is redundant and wrong for truthy non-bool values.',
  },
  {
    id: '180', title: 'Debug print macro (Rust)', category: 'code', severity: 'minor',
    authority: 'propose', exts: RUST, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\b(dbg!|println!|eprintln!|print!|eprint!)\s*\(/,
    fix: 'dbg! is never meant to ship; for diagnostics use log / tracing (debug!/info!). Leave println! if it is the program\'s real output.',
  },
  {
    id: '181', title: 'panic() instead of returning an error (Go)', category: 'code', severity: 'major',
    authority: 'flag', exts: GO, skipTests: true, respectComments: true, confidence: 'medium',
    // The builtin panic only — not a method/func named panic.
    re: /(?<![\w.])(?<!func\s)panic\s*\(/,
    fix: 'Prefer returning an error so the caller decides — panic() takes down the whole process. Fair only for a truly unrecoverable init failure (FLAG: a human should confirm which this is).',
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
    severity: 'major', authority: 'propose', confidence: 'medium',
    fix: 'Split by responsibility into components/hooks/services. Preserve behavior; do it on a branch.',
  },
  {
    id: '068', title: 'Copy-pasted duplicated code block', category: 'code',
    severity: 'major', authority: 'propose', confidence: 'low',
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

// Confidence = how sure the detector is, separate from severity (how bad it is if
// real). Precise syntactic detectors are 'high'; idiom-matching design/copy tells
// and line-count/line-hash heuristics are softer, so a CI gate can filter on it
// (--min-confidence) without changing what the scan reports. A per-rule `confidence`
// wins; otherwise whole categories of heuristics default below 'high'.
const CONFIDENCE_BY_CATEGORY = { visual: 'medium', copy: 'medium' };
const confidenceOf = (rule) => rule.confidence || CONFIDENCE_BY_CATEGORY[rule.category] || 'high';

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

module.exports = { LINE_RULES, WHOLE_FILE_RULES, META_RULES, META, confidenceOf, CODE, STYLE, MARKUP, TS };
