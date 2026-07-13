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
// §22 new languages / §23 frameworks
const JAVA = ['.java'];
const CSHARP = ['.cs'];
const RUBY = ['.rb'];
const PHP = ['.php'];
const SHELL = ['.sh', '.bash', '.zsh'];
const SQL = ['.sql'];
const KOTLIN = ['.kt', '.kts'];
const SWIFT = ['.swift'];
const CLANG = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'];
const VUE = ['.vue'];

// Path targets for config / IaC rules (matched against the full file path).
const DOCKERFILE_RE = /(^|[\\/])Dockerfile(\.[\w.-]+)?$/i;
const COMPOSE_RE = /(^|[\\/])(docker-)?compose[\w.-]*\.ya?ml$/i;
const WORKFLOW_RE = /[\\/]\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/i;

// Taint-lite: user-/externally-derived sources. An injection/XSS rule that matches
// a line WITHOUT one of these keeps firing but at a downgraded confidence (likely a
// constant/internal value, not attacker-controlled) — so a real `${req.query.id}`
// scores full while a `${tableName}` constant contributes far less to the verdict.
const TAINT_RE = /\b(req|request|params?|query|body|args?|argv|input|user\w*|ctx|event|payload|form\w*|search\w*|location|process\.env|data|untrusted|external|raw)\b/i;

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
    authority: 'propose', exts: TS, skipTests: false, respectComments: true, confidence: 'medium',
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
    re: /((api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*['"][^'"\s]{12,}['"]|\bsk-[A-Za-z0-9]{16,}|\bBearer\s+[A-Za-z0-9._-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN[A-Z ]*PRIVATE KEY-----)/i,
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
    unlessFile: /\.d\.ts$/,
    // Assignment only (`=`, not `===` comparison). Data-flow-lite: a constant string
    // literal (`innerHTML = "static"`, `__html: "..."`) carries no user data — not XSS.
    re: /(dangerouslySetInnerHTML|\.innerHTML\s*=(?!=))/,
    unless: /DOMPurify|sanitize|__html\s*:\s*['"]|\.innerHTML\s*=\s*['"]/i,
    taint: TAINT_RE,
    fix: 'Render as text, or sanitize with DOMPurify + an allowlist before injecting.',
  },
  {
    id: '072', title: 'SQL injection via template literal', category: 'security', severity: 'critical',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    // Require real SQL structure (SELECT…FROM, INSERT INTO, UPDATE…SET, DELETE FROM)
    // so plain-English copy like `Last update: ${t}` is not flagged as injection.
    re: /`[^`]*(\bSELECT\b[^`]*\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b)[^`]*\$\{/i,
    taint: TAINT_RE,
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
    authority: 'propose', exts: TS, skipTests: false, respectComments: true, confidence: 'medium',
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
    taint: TAINT_RE,
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
    taint: TAINT_RE,
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

  // ---- §0 Tier-0 "easy misses" — table-stakes, ~100% precision ----
  {
    id: '182', title: 'Merge-conflict marker committed', category: 'code', severity: 'critical',
    authority: 'flag', exts: null, skipTests: false, respectComments: false,
    // A conflict base (`=======`), ours (`<<<<<<< `) or theirs (`>>>>>>> `) marker at
    // column 0 — this file does not parse. Docs (.md) aren't scanned, so `====` rules
    // in Markdown never reach here.
    re: /^(<{7}|={7}|>{7})(\s|$)/,
    fix: 'Resolve the merge and delete the <<<<<<< / ======= / >>>>>>> markers — this code is syntactically broken.',
  },
  {
    id: '183', title: '@ts-ignore / @ts-expect-error without a reason', category: 'code', severity: 'major',
    authority: 'flag', exts: CODE, skipTests: false, respectComments: false,
    // A bare directive (nothing after it) silences a real type error with no trail.
    re: /@ts-(ignore|expect-error)\s*(\*\/\s*)?$/,
    fix: 'Add a reason after the directive (`@ts-expect-error <why>`) or fix the underlying type — a bare suppression hides a genuine error.',
  },
  {
    id: '184', title: 'Blanket eslint-disable without a rule name', category: 'code', severity: 'major',
    authority: 'flag', exts: CODE, skipTests: false, respectComments: false,
    // Must be the comment's leading content (not a mention in prose), and have no rule
    // name after it — a blanket disable silences every present AND future lint error.
    re: /(\/\/|\/\*)\s*eslint-disable(-next-line|-line)?\s*(\*\/\s*)?$/,
    fix: 'Name the exact rule(s) and add a reason (`eslint-disable-next-line no-console — <why>`). A blanket disable hides unrelated errors too.',
  },
  {
    id: '185', title: 'debugger statement left in', category: 'code', severity: 'major',
    authority: 'auto', exts: CODE, skipTests: false, respectComments: true,
    re: /\bdebugger\b\s*;?/,
    fix: 'Remove the debugger statement — it halts execution whenever devtools are open.',
  },
  {
    id: '186', title: 'Focused test disables the rest of the suite', category: 'code', severity: 'major',
    authority: 'flag', exts: CODE, skipTests: false, respectComments: true, confidence: 'medium',
    re: /(\b(describe|it|test|context|suite)\.only\s*\(|\bfdescribe\s*\(|\bfit\s*\()/,
    fix: 'Remove .only / fdescribe / fit before committing — a focused test silently skips every other test in the file, so CI goes green on almost nothing.',
  },
  {
    id: '187', title: 'Skipped / TODO test committed', category: 'code', severity: 'minor',
    authority: 'flag', exts: CODE, skipTests: false, respectComments: true, confidence: 'medium',
    re: /(\b(describe|it|test|context)\.(skip|todo)\s*\(|\bxit\s*\(|\bxdescribe\s*\(|\bxtest\s*\()/,
    fix: 'A committed skipped test is dead coverage — finish it, or delete it and track the gap as a real issue.',
  },
  {
    id: '188', title: 'Non-null assertion (!) overuse', category: 'code', severity: 'minor',
    authority: 'propose', exts: TS, skipTests: true, respectComments: true, confidence: 'medium',
    unlessFile: /\.d\.ts$/,
    // `foo!.bar`, `foo!()`, `arr[0]!.x` — the `!` before `.` / `(` / `[`. Excludes `!=`,
    // `!==` (a `=` follows the `!`, which isn't in the class).
    re: /[\w)\]]!(?=[.([])/,
    fix: 'The ! non-null assertion overrides the compiler without proving the value exists — narrow with a guard, a default, or optional chaining instead.',
  },
  {
    id: '189', title: '@ts-nocheck disables type-checking for the whole file', category: 'code', severity: 'major',
    authority: 'flag', exts: CODE, skipTests: false, respectComments: false,
    re: /@ts-nocheck\b/,
    fix: 'Remove @ts-nocheck and fix the file\'s type errors — it turns TypeScript off for the entire file, not one line.',
  },
  {
    id: '190', title: 'process.exit() in application / library code', category: 'code', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    // Entry points (bin/, cli, scripts/) legitimately set an exit code; library code
    // should throw/return and let the caller decide.
    unlessFile: /(^|[\\/])(bin|cli|scripts?)[\\/]|\.cli\.|cli\.[jt]sx?$/,
    re: /process\.exit\s*\(/,
    fix: 'Throw an error or return a status and let the entry point exit — process.exit() skips cleanup, breaks tests, and kills any process that embeds your code.',
  },

  // ---- §1 Secrets — breadth (provider-prefixed tokens, JWTs, creds-in-URL) ----
  {
    id: '192', title: 'Hardcoded provider credential', category: 'security', severity: 'critical',
    authority: 'flag', exts: null, skipTests: true, respectComments: false,
    // Distinctive provider prefixes → near-zero false positives. Complements 058
    // (OpenAI sk-, AWS AKIA, GitHub ghp_, Slack xox, Bearer, PEM) with GCP, GitLab,
    // the other GitHub token types, Stripe secret/restricted, npm, PyPI, SendGrid,
    // HuggingFace, Twilio, and Slack incoming-webhook URLs. pk_live_ is intentionally
    // ABSENT — a Stripe publishable key is public by design.
    re: /(AIza[0-9A-Za-z_\-]{35}|glpat-[0-9A-Za-z_\-]{20,}|gh[ous]_[A-Za-z0-9]{36}|github_pat_[0-9a-zA-Z_]{22,}|sk_live_[0-9a-zA-Z]{16,}|rk_live_[0-9a-zA-Z]{16,}|npm_[A-Za-z0-9]{36}|pypi-[A-Za-z0-9_\-]{16,}|SG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}|hf_[A-Za-z0-9]{34}|SK[0-9a-f]{32}|https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/]{20,})/,
    unless: /process\.env|import\.meta\.env|getenv|REPLACE|YOUR_|example|placeholder|\*{4,}|xxxx/i,
    fix: 'Move it to an env var / secret manager. A committed provider credential is COMPROMISED — revoke and rotate it now.',
  },
  {
    id: '193', title: 'Hardcoded JWT', category: 'security', severity: 'major',
    authority: 'flag', exts: null, skipTests: true, respectComments: false,
    // Three base64url segments, header starting `eyJ` (base64 of `{"`). A real
    // signed token embedded in source — not the `ey.some.jwt` placeholder (too short).
    re: /\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/,
    unless: /process\.env|import\.meta\.env|getenv|YOUR_|example|placeholder|xxxx/i,
    fix: 'Never hardcode a JWT — it grants whatever it was signed for until it expires. Mint tokens at runtime; if this one leaked, rotate the signing key.',
  },
  {
    id: '194', title: 'Credentials embedded in a URL', category: 'security', severity: 'critical',
    authority: 'flag', exts: null, skipTests: true, respectComments: false,
    // http(s)/ftp/ssh/git URL with inline user:password@ (DB connection strings are
    // owned by 170). The password segment must be non-trivial to avoid `a:b@` noise.
    re: /\b(https?|ftp|ssh|git):\/\/[^/\s:@"'`]+:[^/\s:@"'`]{3,}@/,
    unless: /YOUR_|:\$\{|:%[A-Z]|user:pass(word)?@|:xxx|:changeme@|:secret@/i,
    fix: 'Strip the credentials from the URL — they leak into logs, history, and referrers. Pass auth via a header or a secret manager.',
  },

  // ---- §32 Route A — robustness / "will it break?" (static, regex-clean subset) ----
  {
    id: '195', title: 'parseInt without a radix', category: 'robustness', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    // A single-argument parseInt guesses the base from the string — "08" or "0x10"
    // parse surprisingly across engines/inputs. Two-arg calls (…, 10) are exempt.
    re: /\bparseInt\s*\(\s*[^,)]+\)/,
    fix: 'Pass the radix explicitly: parseInt(x, 10). Without it, leading-zero and 0x inputs parse to the wrong number.',
  },
  {
    id: '196', title: 'RegExp built from user input (ReDoS / throw)', category: 'robustness', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    // new RegExp(<something with a request/user/input token>) — an invalid pattern
    // throws, and an attacker-supplied one can hang the event loop (ReDoS).
    re: /new RegExp\s*\([^)]*\b(input|user|req|request|param|query|body|arg)\w*\b/i,
    fix: 'Validate/escape the input before compiling it, or match against a fixed pattern. A user-supplied regex can throw or catastrophically backtrack (ReDoS).',
  },
  {
    id: '197', title: 'Unchecked .find() / .match() result dereferenced', category: 'robustness', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    // arr.find(…).x / str.match(…)[1] / el.querySelector(…).value — these return
    // undefined/null when nothing matches, so the immediate property/index access
    // is a "cannot read properties of undefined" crash on the unhappy path.
    re: /\.(find|match|querySelector|closest)\s*\([^)]*\)\s*[.[]/,
    fix: 'Guard the result first (`const m = str.match(re); if (m) …`) or use optional chaining — .find/.match/querySelector return null/undefined when nothing matches.',
  },
  {
    id: '198', title: 'JSON.parse of external data without a guard', category: 'robustness', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'low',
    // Parsing an awaited response, storage, env, or request body that can be malformed.
    // Low confidence: a regex can't see a surrounding try/catch, so this is a soft nudge
    // (gate it out with --min-confidence medium). Inline `try` on the same line is exempt.
    re: /JSON\.parse\s*\(\s*(await\b|localStorage|sessionStorage|process\.env|req\.|request\.|res\.|response\.)/,
    unless: /\btry\b/,
    fix: 'Wrap external JSON.parse in try/catch and handle the malformed case — untrusted/awaited data is not guaranteed to be valid JSON.',
  },

  // ---- §5 IaC / Docker / CI-CD config scanning ----
  {
    id: '199', title: 'Unpinned Docker base image (:latest or no tag)', category: 'supply-chain', severity: 'major',
    authority: 'propose', files: DOCKERFILE_RE, respectComments: true, confidence: 'medium',
    re: /^\s*FROM\s+(?!scratch\b)[^\s:@]+(:latest)?\s*(AS\s+\w+)?\s*$/i,
    fix: 'Pin the base image to an immutable tag or digest (node:20.11.1-alpine, or @sha256:…). :latest / untagged drifts and breaks reproducible builds.',
  },
  {
    id: '200', title: 'Docker container runs as root', category: 'security', severity: 'major',
    authority: 'propose', files: DOCKERFILE_RE, respectComments: true, confidence: 'medium',
    re: /^\s*USER\s+root\b/i,
    fix: 'Create and switch to a non-root user (RUN adduser … && USER app) — a root container turns any escape into host access.',
  },
  {
    id: '201', title: 'Docker fetches and executes a remote script', category: 'security', severity: 'major',
    authority: 'propose', files: DOCKERFILE_RE, respectComments: true,
    re: /(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(sh|bash)\b|^\s*ADD\s+https?:\/\//i,
    fix: 'Do not pipe a remote URL into a shell. COPY a vendored, reviewed file, or download then verify a checksum/signature before running it.',
  },
  {
    id: '202', title: 'Secret baked into a Docker ENV/ARG', category: 'security', severity: 'critical',
    authority: 'flag', files: DOCKERFILE_RE, respectComments: true,
    re: /^\s*(ENV|ARG)\s+\w*(SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)\w*\s*[= ]\s*\S/i,
    fix: 'Never bake a secret into an image layer — it persists in the image history. Use build secrets (--mount=type=secret) or inject at runtime.',
  },
  {
    id: '203', title: 'Insecure docker-compose service setting', category: 'security', severity: 'major',
    authority: 'propose', files: COMPOSE_RE, respectComments: true,
    re: /(privileged:\s*true|network_mode:\s*['"]?host|^\s*-\s*["']?\/:\/)/i,
    fix: 'Drop privileged, host networking, and root bind-mounts — they hand the container the host. Grant only the specific capabilities, ports, and volumes needed.',
  },
  {
    id: '204', title: 'Workflow uses pull_request_target', category: 'security', severity: 'major',
    authority: 'flag', files: WORKFLOW_RE, respectComments: true,
    re: /pull_request_target/,
    fix: 'pull_request_target runs with repo secrets against untrusted PR code — never check out + build the PR head under it. Use pull_request, or gate it strictly.',
  },
  {
    id: '205', title: 'Unpinned GitHub Action (moving ref)', category: 'supply-chain', severity: 'major',
    authority: 'propose', files: WORKFLOW_RE, respectComments: true, confidence: 'medium',
    re: /uses:\s*[\w.\-/]+@(main|master|latest|HEAD)\b/i,
    fix: 'Pin actions to a full commit SHA (or at minimum an immutable release tag). @main/@master can change under you — a supply-chain foothold.',
  },
  {
    id: '206', title: 'Workflow expands untrusted input into a run script', category: 'security', severity: 'major',
    authority: 'flag', files: WORKFLOW_RE, respectComments: true,
    re: /\$\{\{\s*github\.event\.(issue|pull_request|comment|review|head_ref|discussion)/,
    fix: 'Never interpolate ${{ github.event.* }} straight into run: — it is attacker-controlled and injects shell. Pass it through an env: var and quote it.',
  },

  // ---- §10 Testing — detectors that fire only inside test files (testOnly) ----
  {
    id: '207', title: 'Tautological / self-comparing assertion', category: 'testing', severity: 'major',
    authority: 'flag', exts: CODE, skipTests: false, respectComments: true, testOnly: true,
    // expect(X).toBe(X) — a constant or a value compared to itself always passes and
    // tests nothing.
    re: /expect\(\s*([^)]+?)\s*\)\s*\.(toBe|toEqual|toStrictEqual)\(\s*\1\s*\)/,
    fix: 'Assert the real expected value, not the input compared to itself — a tautology is green coverage over nothing.',
  },
  {
    id: '208', title: 'Assertion with no matcher', category: 'testing', severity: 'major',
    authority: 'flag', exts: CODE, skipTests: false, respectComments: true, testOnly: true, confidence: 'medium',
    // `expect(x);` with nothing chained — evaluates the value and asserts nothing.
    re: /\bexpect\s*\([^)]*\)\s*;?\s*$/,
    fix: 'Chain a matcher (.toBe/.toEqual/…). A bare expect(x) runs the code but verifies nothing.',
  },
  {
    id: '209', title: 'Sleep-based (flaky) test wait', category: 'testing', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: false, respectComments: true, testOnly: true, confidence: 'medium',
    re: /\b(await\s+)?(sleep|delay)\s*\(\s*\d+|setTimeout\s*\(\s*[^,]+,\s*\d{3,}\s*\)/,
    fix: 'Wait on the real condition (await the event, poll a state, use fake timers) — a fixed sleep is the classic flaky-test race.',
  },
  {
    id: '210', title: 'Dead / disabled code behind if (false)', category: 'code', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: false, respectComments: true, confidence: 'medium',
    re: /\bif\s*\(\s*(false|0)\s*\)/,
    fix: 'Delete the disabled block (rely on git history) or restore it — an `if (false)` guard is dead code, often a silently disabled assertion.',
  },

  // ---- §11 Fake / placeholder features (the most AI-specific category) ----
  {
    id: '211', title: 'Hardcoded dashboard stat', category: 'fake', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    // A metric-named key set to a big literal — the fabricated "12,847 users" number
    // an AI drops in to make a dashboard look alive.
    re: /\b(users|revenue|customers|downloads|signups|visitors|sales|subscribers|followers|mrr|arr|orders|impressions)\s*:\s*['"]?[\d,]{4,}/i,
    fix: 'Bind the metric to real data (an API/query). A hardcoded headline number is a fake feature — it lies to whoever reads the dashboard.',
  },
  {
    id: '212', title: 'Mock / fake data on a production path', category: 'fake', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\b(mock|dummy|fake|sample|placeholder)(Data|Users|Items|Products|Response|Results|List|Rows)\b/,
    fix: 'Replace the mock/dummy data with a real data source before shipping — this is a stub masquerading as a feature.',
  },
  {
    id: '213', title: 'Fabricated metric from Math.random()', category: 'fake', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\b(count|total|revenue|users|price|score|rating|views|visitors|progress|percent|growth)\w*\s*[:=][^;\n]*Math\.random\s*\(/i,
    fix: 'A displayed number driven by Math.random() is fabricated. Wire it to the real value — random noise is not a metric.',
  },
  {
    id: '214', title: 'Empty event handler (does nothing)', category: 'fake', severity: 'minor',
    authority: 'propose', exts: MARKUP, skipTests: true, respectComments: true,
    re: /\bon[A-Z]\w+\s*=\s*\{?\s*(async\s*)?\(\s*\)\s*=>\s*\{\s*\}/,
    fix: 'A no-op handler is a button that pretends to work. Wire it up, or remove the control until it does something.',
  },
  {
    id: '215', title: 'Stub returning a canned value', category: 'fake', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    re: /return\s+\{\s*(ok|success|status)\s*:\s*(true|['"]ok['"]|['"]success['"])\s*\}\s*;?\s*$/i,
    fix: 'A handler that always returns { ok: true } does no real work — implement it or mark it clearly unimplemented (throw), don\'t fake success.',
  },
  {
    id: '216', title: '"Coming soon" / placeholder feature copy', category: 'copy', severity: 'minor',
    authority: 'flag', exts: MARKUP, skipTests: true, respectComments: false,
    re: /\b(coming soon|under construction|work in progress|not implemented yet|todo:\s*implement)\b/i,
    fix: 'Ship the feature or remove the surface — a "coming soon" in production is a promise the UI can\'t keep (FLAG: it may be an intentional roadmap teaser).',
  },
  {
    id: '217', title: 'Fake sample identity (example.com / John Doe)', category: 'copy', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    re: /@example\.(com|org|net)\b|\b(john|jane)\s*doe\b/i,
    fix: 'Replace placeholder identities (john@example.com, "John Doe") with real bindings or clearly-labelled fixtures — they leak into shipped UI.',
  },

  // ---- §8 error handling + §9 async (regex-clean subset) ----
  {
    id: '218', title: 'Swallowed promise rejection', category: 'code', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    // .catch(() => {}) / .catch(console.log) — the rejection is discarded or merely
    // logged and dropped, so a failed async op fails silently.
    re: /\.catch\s*\(\s*(\(\s*\w*\s*\)\s*=>\s*\{\s*\}|console\.\w+\s*\))/,
    fix: 'Handle the rejection: surface an error to the user, retry, or rethrow. An empty/console-only .catch hides real failures.',
  },
  {
    id: '219', title: 'Throwing a string instead of an Error', category: 'code', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\bthrow\s+['"`]/,
    fix: 'throw new Error("…") — a thrown string has no stack trace and breaks `instanceof Error` handling downstream.',
  },
  {
    id: '220', title: 'Generic "something went wrong" error message', category: 'copy', severity: 'minor',
    authority: 'propose', exts: null, skipTests: true, respectComments: true, confidence: 'medium',
    re: /(something went wrong|an error occurred|unknown error occurred|oops[,! ].*wrong)/i,
    fix: 'Tell the user what failed and what to do next. A generic "something went wrong" is the AI-error tell and gives no path to recovery.',
  },
  {
    id: '221', title: 'Global uncaughtException / unhandledRejection swallow', category: 'code', severity: 'major',
    authority: 'flag', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    re: /process\.on\s*\(\s*['"](uncaughtException|unhandledRejection)['"]/,
    fix: 'A process-wide catch-all that logs and continues leaves the process in an unknown state — let it crash and restart under a supervisor, or handle the specific error at its source.',
  },

  // ---- §6 code quality + §7 TS depth (regex-clean subset) ----
  {
    id: '222', title: '`Function` / `Object` used as a type', category: 'code', severity: 'major',
    authority: 'propose', exts: TS, skipTests: false, respectComments: true, confidence: 'medium',
    // The `.` lookahead skips `Object.keys(…)` (a value, not a type annotation).
    re: /(:\s*(Function|Object)\b(?!\s*\.)|\bas\s+(Function|Object)\b(?!\s*\.))/,
    fix: 'Use a precise signature ((x: T) => U) or a concrete interface. `Function`/`Object` opt out of type-checking almost as much as `any`.',
  },
  {
    id: '223', title: '`var` instead of `const` / `let`', category: 'code', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: false, respectComments: true, confidence: 'low',
    re: /\bvar\s+\w/,
    fix: 'Use const (or let). `var` is function-scoped and hoisted — a source of subtle scope bugs the block-scoped keywords remove. (Low confidence: common in pre-ES6 hand-written code, not an AI-slop tell — gate it out with --min-confidence medium.)',
  },
  {
    id: '224', title: 'Loose equality (== / !=)', category: 'code', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'low',
    // Flags == / != but not === / !== / <= / >=, and exempts the accepted `== null`
    // / `!= null` idiom (a deliberate null-AND-undefined check).
    re: /(?<![=!<>])(==|!=)(?!=)(?!\s*(null|undefined)\b)/,
    fix: 'Use === / !== to avoid type-coercion surprises. (`== null` to catch null-or-undefined is the one accepted exception.)',
  },
  {
    id: '225', title: 'Empty function body (stub)', category: 'code', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\bfunction\b[^{;(]*\([^)]*\)\s*\{\s*\}/,
    fix: 'An empty function is a stub — implement it, or if a no-op is intentional, name it that way and add a comment so it doesn\'t read as unfinished.',
  },
  {
    id: '226', title: 'Unnecessary `return await`', category: 'code', severity: 'minor',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    // (return await inside try/catch is legitimate for stack traces — a reviewer call.)
    re: /\breturn\s+await\b/,
    fix: 'Outside a try/catch, `return await x` just adds a microtask — `return x` is equivalent. Inside try/catch it is fine; keep it there.',
  },

  // ---- §14 a11y + §15 mobile + §16 visual + §17 copy (regex-clean subset) ----
  {
    id: '227', title: 'High-pressure / ALL-CAPS marketing CTA', category: 'copy', severity: 'minor',
    authority: 'propose', exts: MARKUP, skipTests: true, respectComments: false, confidence: 'medium',
    re: /\b(SIGN UP NOW|BUY NOW|SUBSCRIBE NOW|CLICK HERE|SHOP NOW|ORDER NOW|LIMITED TIME|ACT NOW|DON'T MISS)\b/,
    fix: 'Write a calm, specific CTA in sentence case ("Start your free trial"). SHOUTING urgency copy is the AI-landing-page tell.',
  },
  {
    id: '228', title: 'Unsupported marketing superlative', category: 'copy', severity: 'minor',
    authority: 'propose', exts: MARKUP, skipTests: true, respectComments: false, confidence: 'medium',
    re: /\b(world-?class|#1\b|best-in-class|industry-leading|state-of-the-art|revolutionary|game-?changing|next-generation|unparalleled)\b/i,
    fix: 'Replace the superlative with a concrete claim you can back ("processes 10k events/sec"). Unproven "world-class" copy reads as AI filler.',
  },
  {
    id: '229', title: '<html> missing a lang attribute', category: 'a11y', severity: 'minor',
    authority: 'propose', exts: MARKUP, skipTests: true, respectComments: false,
    re: /<html(?![^>]*\blang\s*=)[^>]*>/i,
    fix: 'Add lang (e.g. <html lang="en">) so screen readers and translation use the right language.',
  },
  {
    id: '230', title: 'Positive tabIndex (breaks tab order)', category: 'a11y', severity: 'minor',
    authority: 'propose', exts: MARKUP, skipTests: true, respectComments: true,
    re: /tab[Ii]ndex\s*=\s*["'{]*\s*[1-9]/,
    fix: 'Use tabIndex={0} (focusable, natural order) or -1 (programmatic) — a positive tabIndex hijacks the whole page\'s tab order.',
  },
  {
    id: '231', title: 'Viewport disables zoom (user-scalable=no)', category: 'a11y', severity: 'major',
    authority: 'propose', exts: MARKUP, skipTests: true, respectComments: false,
    re: /user-scalable\s*=\s*['"]?no|maximum-scale\s*=\s*['"]?1(\.0)?\b/i,
    fix: 'Never disable pinch-zoom — it locks out low-vision users. Remove user-scalable=no / maximum-scale=1 from the viewport meta.',
  },
  {
    id: '232', title: 'Body text below the ~12px legibility floor', category: 'mobile', severity: 'minor',
    authority: 'propose', exts: STYLE, skipTests: true, respectComments: false, confidence: 'medium',
    re: /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/,
    fix: 'Use ≥12px (ideally rem-based) for body copy — sub-12px text is unreadable on mobile and fails accessibility.',
  },
  {
    id: '233', title: 'width: 100vw (horizontal-overflow tell)', category: 'mobile', severity: 'minor',
    authority: 'propose', exts: STYLE, skipTests: true, respectComments: false, confidence: 'medium',
    re: /width:\s*100vw\b/,
    fix: '100vw ignores the scrollbar and causes horizontal overflow on desktop. Use width:100% / max-width instead.',
  },
  {
    id: '234', title: '!important override', category: 'visual', severity: 'minor',
    authority: 'propose', exts: STYLE, skipTests: true, respectComments: false, confidence: 'medium',
    re: /!important/,
    fix: 'Fix the specificity instead of forcing it — scattered !important is a signal the cascade has stopped being reasoned about.',
  },

  // ---- §22 new languages ----
  {
    id: '235', title: 'printStackTrace() left in (Java)', category: 'code', severity: 'minor',
    authority: 'propose', exts: JAVA, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\.printStackTrace\s*\(/,
    fix: 'Log through a real logger (SLF4J/Log4j) with context. printStackTrace() dumps to stderr and is invisible in production log aggregation.',
  },
  {
    id: '236', title: 'System.out/err debug print (Java)', category: 'code', severity: 'minor',
    authority: 'propose', exts: JAVA, skipTests: true, respectComments: true, confidence: 'medium',
    re: /System\.(out|err)\.print/,
    fix: 'Use a logging framework with levels instead of System.out — stray console prints are debug leftovers.',
  },
  {
    id: '237', title: 'Runtime.exec / ProcessBuilder command execution (Java)', category: 'security', severity: 'major',
    authority: 'propose', exts: JAVA, skipTests: true, respectComments: true,
    re: /Runtime\.getRuntime\(\)\.exec\s*\(|new\s+ProcessBuilder\s*\(/,
    fix: 'Avoid shelling out; if you must, pass an argument array (never a concatenated string) and validate inputs — this is a command-injection sink.',
  },
  {
    id: '238', title: 'Console.Write debug (C#)', category: 'code', severity: 'minor',
    authority: 'propose', exts: CSHARP, skipTests: true, respectComments: true, confidence: 'medium',
    re: /Console\.(WriteLine|Write)\s*\(/,
    fix: 'Use ILogger with levels instead of Console.Write — console output is a debug leftover in a real app.',
  },
  {
    id: '239', title: 'async void (C#)', category: 'code', severity: 'major',
    authority: 'propose', exts: CSHARP, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\basync\s+void\b/,
    fix: 'Use async Task — an async void method can\'t be awaited and its exceptions crash the process. (Event handlers are the only legitimate exception.)',
  },
  {
    id: '240', title: 'Debugger breakpoint left in (Ruby)', category: 'code', severity: 'major',
    authority: 'flag', exts: RUBY, skipTests: false, respectComments: true,
    re: /\b(binding\.pry|byebug|binding\.irb)\b/,
    fix: 'Remove the binding.pry / byebug breakpoint — it halts execution and hangs the process wherever it\'s hit.',
  },
  {
    id: '241', title: 'puts / pp debug output (Ruby)', category: 'code', severity: 'minor',
    authority: 'propose', exts: RUBY, skipTests: true, respectComments: true, confidence: 'medium',
    re: /^\s*(puts|pp)\s+/,
    fix: 'Use the logger (Rails.logger / Logger) with levels rather than puts/pp for diagnostics you can turn off.',
  },
  {
    id: '242', title: 'var_dump / print_r debug (PHP)', category: 'code', severity: 'minor',
    authority: 'propose', exts: PHP, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\b(var_dump|print_r|var_export)\s*\(/,
    fix: 'Remove the debug dump or route through a logger — var_dump/print_r output leaks straight into the page.',
  },
  {
    id: '243', title: 'Remote script piped into a shell', category: 'security', severity: 'major',
    authority: 'flag', exts: SHELL, skipTests: false, respectComments: true,
    re: /(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(sh|bash)\b/i,
    fix: 'Download, inspect, and verify (checksum/signature) before executing. Piping a URL straight into a shell runs whatever the server serves today.',
  },
  {
    id: '244', title: 'rm -rf on an unquoted/variable path', category: 'robustness', severity: 'major',
    authority: 'flag', exts: SHELL, skipTests: false, respectComments: true, confidence: 'medium',
    re: /\brm\s+-[rf]{1,2}[a-z]*\s+["']?\$/i,
    // Exempt the safe idioms: `${VAR:?}` (errors if unset) and `${VAR:-default}`.
    unless: /\$\{[^}]*:[?=-]/,
    fix: 'An empty or mis-set variable turns `rm -rf $DIR/` into `rm -rf /`. Quote it and guard the value: `rm -rf "${DIR:?}"` (aborts if unset).',
  },
  {
    id: '245', title: 'chmod 777 (world-writable)', category: 'security', severity: 'major',
    authority: 'propose', exts: SHELL, skipTests: false, respectComments: true,
    re: /\bchmod\s+(-R\s+)?[0-7]?777\b/,
    fix: 'World-writable (777) lets any local user modify the file/dir. Grant the least permission that works (e.g. 750/640).',
  },
  {
    id: '246', title: 'DELETE / UPDATE without a WHERE clause (SQL)', category: 'robustness', severity: 'critical',
    authority: 'flag', exts: SQL, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\b(DELETE\s+FROM|UPDATE)\s+[\w."`]+\b(?![^;]*\bWHERE\b)[^;]*;/i,
    fix: 'A DELETE/UPDATE with no WHERE rewrites the ENTIRE table. Add a WHERE, or if a full-table change is truly intended, say so explicitly.',
  },
  {
    id: '247', title: 'GRANT ALL privileges (SQL)', category: 'security', severity: 'major',
    authority: 'flag', exts: SQL, skipTests: true, respectComments: true,
    re: /\bGRANT\s+ALL\b/i,
    fix: 'Grant only the specific privileges the role needs (SELECT/INSERT/…). GRANT ALL is the database equivalent of running as root.',
  },

  // ---- §23 framework-specific packs ----
  {
    id: '248', title: 'v-html (Vue XSS sink)', category: 'security', severity: 'critical',
    authority: 'propose', exts: VUE, skipTests: true, respectComments: true,
    re: /v-html\s*=/,
    fix: 'v-html renders raw HTML — an XSS hole for any user content. Render as text ({{ }}), or sanitize with DOMPurify + an allowlist first.',
  },
  {
    id: '249', title: 'debug=True in production config (Python)', category: 'security', severity: 'major',
    authority: 'flag', exts: PY, skipTests: true, respectComments: true,
    re: /\b(DEBUG\s*=\s*True|debug\s*=\s*True)\b/,
    fix: 'debug=True leaks stack traces and an interactive console to users (Django/Flask). Drive it from an env var and default to False.',
  },
  {
    id: '250', title: 'html_safe / raw output (Rails XSS sink)', category: 'security', severity: 'major',
    authority: 'propose', exts: RUBY, skipTests: true, respectComments: true,
    re: /\.html_safe\b|\braw\s*\(/,
    fix: 'html_safe / raw disable Rails\' auto-escaping — an XSS hole for user content. Sanitize with the `sanitize` helper + an allowlist instead.',
  },
  {
    id: '251', title: 'bypassSecurityTrust* (Angular XSS bypass)', category: 'security', severity: 'critical',
    authority: 'flag', exts: TS, skipTests: true, respectComments: true,
    re: /bypassSecurityTrust\w*/,
    fix: 'bypassSecurityTrust* turns off Angular\'s sanitizer for that value — only ever apply it to a value you fully control, never user input.',
  },
  {
    id: '252', title: 'Untrusted file content echoed to a terminal/log', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    // File contents can carry ANSI/control sequences that drive the reader's terminal
    // (the exact bug class slopscore fixed in its own output). Flags a file read piped
    // straight into console.*/stdout/stderr without sanitization.
    re: /(console\.\w+|process\.(stdout|stderr)\.write)\s*\([^)]*\breadFile(Sync)?\s*\(/,
    fix: 'Strip control/escape characters (or hex-encode) before printing untrusted file content to a terminal or log — raw content can inject terminal escape sequences.',
  },

  // ---- code-level security (taint-gated: only fire when a user source is present) ----
  {
    id: '253', title: 'Path traversal — filesystem access from request input', category: 'security', severity: 'critical',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\b(readFile|readFileSync|createReadStream|createWriteStream|sendFile|readdir|readdirSync|unlink|unlinkSync|writeFile|writeFileSync)\s*\([^)]*\b(req|request|userInput|userPath)\b/,
    fix: 'Resolve against a fixed base dir and reject anything escaping it (path.resolve + startsWith allowlist). Never pass request input straight to the filesystem — `../` climbs out.',
  },
  {
    id: '254', title: 'Open redirect from user input', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\b(res|response)\.redirect\s*\(\s*(req|request)\b|location(\.href)?\s*=\s*(req|request|userInput)\b/,
    fix: 'Validate the target against an allowlist of known paths/hosts; never redirect straight to a user-supplied URL (phishing / token leak).',
  },
  {
    id: '255', title: 'SSRF — outbound request to a user-controlled URL', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\b(fetch|axios|got|superagent|https?\.(get|request))\s*\([^)]*\b(req|request|userUrl|targetUrl)\b/,
    fix: 'Validate the host against an allowlist and block internal ranges (127/10/169.254/metadata). Never fetch a raw user-supplied URL (SSRF).',
  },
  {
    id: '256', title: 'NoSQL injection', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\$where\s*:|\{\s*\$(ne|gt|gte|lt|lte|regex|in|nin)\s*:\s*[^}]*\breq(uest)?\b/,
    fix: 'Cast/validate the input to the expected scalar type; never pass a raw request object into a Mongo query operator ($ne/$where let an attacker rewrite the query).',
  },
  {
    id: '257', title: 'Mass assignment from request body', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\bnew\s+\w+\s*\(\s*req\.(body|params|query)\s*\)|\.(create|update|save|insert|insertOne|updateOne)\s*\(\s*req\.(body|params|query)\b|Object\.assign\s*\([^)]*,\s*req\.(body|params|query)/,
    fix: 'Allowlist only the fields you expect (a DTO / zod schema / pick). Persisting req.body wholesale lets a client set fields like isAdmin or role.',
  },
  {
    id: '258', title: 'Insecure cookie flag (httpOnly/secure: false)', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\b(httpOnly|secure)\s*:\s*false\b/,
    fix: 'Set httpOnly and secure to true (plus SameSite) on auth/session cookies so they aren\'t readable by JS (XSS) or sent over plain HTTP.',
  },
  {
    id: '259', title: 'Deprecated / insecure cipher (createCipher)', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true,
    re: /\bcreate(Cipher|Decipher)\s*\(/,
    fix: 'Use createCipheriv/createDecipheriv with a random IV and an AEAD mode (aes-256-gcm). createCipher derives a weak key/IV and is deprecated.',
  },

  // ---- more languages: Kotlin / Swift / C / C++ ----
  {
    id: '260', title: 'Kotlin force-unwrap (!!)', category: 'code', severity: 'minor',
    authority: 'propose', exts: KOTLIN, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\w!!/,
    fix: '!! throws an NPE if the value is null — the opposite of Kotlin\'s null safety. Use ?., the ?: elvis operator, or requireNotNull with a message.',
  },
  {
    id: '261', title: 'Swift force-try (try!)', category: 'code', severity: 'major',
    authority: 'propose', exts: SWIFT, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\btry!\s/,
    fix: 'try! crashes the process on any thrown error. Use do/try/catch to handle it, or try? to get an optional.',
  },
  {
    id: '262', title: 'Debug print (Kotlin / Swift)', category: 'code', severity: 'minor',
    authority: 'propose', exts: KOTLIN.concat(SWIFT), skipTests: true, respectComments: true, confidence: 'medium',
    re: /\b(println|print)\s*\(/,
    fix: 'Use a logging framework with levels (or os.log / Timber) instead of print/println — stray prints are debug leftovers.',
  },
  {
    id: '263', title: 'Unsafe C string function (buffer overflow)', category: 'security', severity: 'critical',
    authority: 'propose', exts: CLANG, skipTests: true, respectComments: true,
    re: /\b(gets|strcpy|strcat|sprintf|vsprintf)\s*\(/,
    fix: 'Use the bounded variants (fgets, strlcpy/strncpy, snprintf). gets/strcpy/strcat/sprintf write past the buffer — classic overflow vectors.',
  },
  {
    id: '264', title: 'system() command execution (C / C++)', category: 'security', severity: 'major',
    authority: 'propose', exts: CLANG, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\bsystem\s*\(/,
    fix: 'system() runs its argument through /bin/sh — a command-injection surface. Use execve/posix_spawn with an argument vector and validated inputs.',
  },

  // ---- language depth (Go / Java / C# / Ruby / PHP / Python) + a cross-language tell ----
  {
    id: '265', title: 'context.TODO() left in (Go)', category: 'code', severity: 'minor',
    authority: 'propose', exts: GO, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\bcontext\.TODO\s*\(\s*\)/,
    fix: 'context.TODO() is a placeholder — thread a real context.Context (with cancellation/deadline) from the caller.',
  },
  {
    id: '266', title: 'String compared with == instead of .equals (Java)', category: 'code', severity: 'major',
    authority: 'propose', exts: JAVA, skipTests: true, respectComments: true, confidence: 'medium',
    re: /(\b\w+\s*==\s*"|"[^"]*"\s*==\s*\w)/,
    fix: 'Use .equals() for String content comparison — `==` compares references and fails for equal-but-distinct strings.',
  },
  {
    id: '267', title: 'Empty catch block (C#)', category: 'code', severity: 'major',
    authority: 'propose', exts: CSHARP, skipTests: true, respectComments: true,
    re: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
    fix: 'Don\'t swallow exceptions — log with context, or handle/rethrow. An empty catch hides real failures.',
  },
  {
    id: '268', title: 'eval on dynamic input (Ruby)', category: 'security', severity: 'critical',
    authority: 'flag', exts: RUBY, skipTests: true, respectComments: true,
    re: /\b(eval|instance_eval|class_eval|module_eval)\s*\(/,
    fix: 'Ruby eval executes arbitrary code — never on untrusted input. Use a safe dispatch (a whitelist/hash of allowed operations).',
  },
  {
    id: '269', title: 'Superglobal used directly in a sink (PHP)', category: 'security', severity: 'critical',
    authority: 'propose', exts: PHP, skipTests: true, respectComments: true,
    re: /(echo|print|->query|mysqli_query|mysql_query|->prepare|exec|system|include|require)\s*\(?[^;]*\$_(GET|POST|REQUEST|COOKIE)/,
    fix: 'Never pass $_GET/$_POST straight into SQL, a shell, echo, or include. Use prepared statements, escaping, and validation.',
  },
  {
    id: '270', title: 'Server-side template injection (Python/Flask)', category: 'security', severity: 'critical',
    authority: 'propose', exts: PY, skipTests: true, respectComments: true,
    re: /\brender_template_string\s*\(/,
    unless: /\bdef\s+render_template_string/,
    fix: 'render_template_string with any user input is SSTI → RCE. Render a fixed template file and pass data as context variables.',
  },
  {
    id: '271', title: 'Timing-unsafe comparison of a secret', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    re: /\b(token|secret|password|passwd|api[_-]?key|hmac|signature|digest)\w*\s*(===?|!==?)\s*['"\w]/i,
    fix: 'Compare secrets/tokens in constant time (crypto.timingSafeEqual / hmac.compare_digest). `===` leaks length/prefix via timing.',
  },
  {
    id: '272', title: 'Sensitive data written to logs', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    re: /(console\.\w+|logger?\.\w+|log\.(info|debug|warn|error|trace))\s*\([^)]*(req\.(body|headers|cookies)|\.(password|passwd|token|secret|apiKey|accessToken|refreshToken|privateKey)\b)/,
    fix: 'Never log credentials, tokens, or whole request bodies/headers — logs get shipped to third parties. Redact sensitive fields first.',
  },
  {
    id: '273', title: 'CORS reflects any origin', category: 'security', severity: 'major',
    authority: 'propose', exts: CODE, skipTests: true, respectComments: true, confidence: 'medium',
    re: /cors\s*\(\s*\{[^}]*origin\s*:\s*(true|\/)/,
    fix: 'origin:true reflects the caller\'s Origin (effectively allow-all, dangerous with credentials). Pin an explicit allowlist of trusted origins.',
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

const SEVERITIES_CUSTOM = new Set(['critical', 'major', 'minor']);
// Catastrophic-backtracking signature: a group whose body already contains a
// quantifier and is itself quantified — (a+)+, (.*)*, (\d+)* — the classic ReDoS
// shapes. A user regex from .slopscore.json runs against every line, so a ReDoS
// pattern could hang the scan; such rules are skipped (and the CLI warns).
const REDOS_RE = /\([^()]*[+*][^()]*\)\s*[+*]/;
const looksReDoS = (pattern) => REDOS_RE.test(String(pattern || ''));

// Turn user "customRules" config entries into scanner rules. Each entry:
//   { "id": "901", "pattern": "bannedApi\\(", "flags": "i", "title": "...",
//     "severity": "minor", "category": "code", "fix": "...", "exts": [".js"] }
// An invalid regex — or a ReDoS-prone one — is skipped (never crashes/hangs the scan).
function buildCustomRules(defs) {
  const out = [];
  for (const d of defs || []) {
    if (!d || !d.id || !d.pattern || looksReDoS(d.pattern)) continue;
    let re;
    try { re = new RegExp(d.pattern, typeof d.flags === 'string' ? d.flags : ''); } catch { continue; }
    out.push({
      id: String(d.id),
      title: d.title || `Custom rule ${d.id}`,
      category: d.category || 'code',
      severity: SEVERITIES_CUSTOM.has(d.severity) ? d.severity : 'minor',
      authority: ['auto', 'propose', 'flag'].includes(d.authority) ? d.authority : 'flag',
      confidence: ['high', 'medium', 'low'].includes(d.confidence) ? d.confidence : 'medium',
      fix: d.fix || 'Custom project rule — see .slopscore.json "customRules".',
      re,
      exts: Array.isArray(d.exts) ? d.exts : null,
      respectComments: d.respectComments !== false,
      custom: true,
    });
  }
  return out;
}

module.exports = { LINE_RULES, WHOLE_FILE_RULES, META_RULES, META, confidenceOf, buildCustomRules, looksReDoS, CODE, STYLE, MARKUP, TS };
