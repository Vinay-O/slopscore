# slopscore — Build Roadmap & Gap Analysis

> An exhaustive, neutral backlog of everything we could build to make slopscore a
> best-in-class, any-language, web-and-mobile-aware AI-slop + security scanner.
> This is a wishlist, not a commitment — pick from it. As of **v1.7.3** the scanner
> ships **85 detectors / 181 catalog patterns**, regex-based, zero-dependency.

## Legend

**Detectability** — how hard the signal is to get:
- `re` — doable today with a regex/line heuristic (no new infra)
- `ast` — needs an AST / parser tier (cyclomatic, taint, cross-file, dead code)
- `render` — needs a headless browser / rendered DOM (true visual + responsive)
- `net` — needs network or a bundled database (CVEs, package existence)
- `cfg` — needs structured parsing of config/IaC/manifest files

**Priority** — `P0` table-stakes (absence is embarrassing) · `P1` high value · `P2` nice · `P3` ambitious
**Effort** — `S` (hours) · `M` (a day) · `L` (multi-day / new subsystem)

---

## 0 · Tier-0 "easy misses" — table-stakes we should already have

> Trivial regex, ~100% precision, high signal. Closing these removes the
> "it doesn't even catch *that*?" objection. Ship as one pack (1.8.0).

- [ ] Merge-conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) — ships broken code `re P0 S`
- [ ] `@ts-ignore` / `@ts-expect-error` without a reason — AI silencing the type checker `re P0 S`
- [ ] `eslint-disable` / `eslint-disable-next-line` without a rule+reason `re P0 S`
- [ ] `debugger;` statement left in `re P0 S`
- [ ] `.only` / `fdescribe` / `fit` — a focused test silently disables the suite `re P0 S`
- [ ] `.skip` / `xit` / `xdescribe` / `test.todo` left committed `re P0 S`
- [ ] Non-null assertion abuse (`foo!.bar`, `foo!()`) `re P1 S`
- [ ] `as any` / `as unknown as X` cast escape hatch (077 covers double-assert; add `as any`) `re P1 S`
- [ ] `// @ts-nocheck` at file top `re P0 S`
- [ ] `print()`-style leftover across more langs (Java `System.out.print`, C# `Console.WriteLine`, PHP `var_dump`/`print_r`, Ruby `puts`/`p`) `re P1 S`
- [ ] `process.exit()` in library code `re P2 S`
- [ ] Hardcoded `localhost`/`127.0.0.1` beyond URLs (099 covers URLs; add bare host config) `re P2 S`
- [ ] `git` conflict-leftover `.orig` files / `.DS_Store` / `Thumbs.db` committed `cfg P2 S`
- [ ] `TODO`/`FIXME`/`HACK`/`XXX`/`WIP` with no owner/ticket (057 partial — add HACK/XXX) `re P2 S`
- [ ] Commented-out code blocks (large) — dead code left behind `re P2 M`

## 1 · Secrets — breadth (today: one shallow regex caught 2/5 common shapes)

> Still zero-dep, just a proper tuned token-pattern set + entropy fallback.

- [ ] AWS access key `AKIA…` / secret key / session token `re P0 S`
- [ ] GCP service-account JSON / `AIza…` API key `re P0 S`
- [ ] Azure connection strings / storage keys `re P1 S`
- [ ] Slack token (`xoxb`/`xoxp`/`xoxa`) + Slack webhook URL `re P0 S`
- [ ] Stripe live/test (`sk_live`, `rk_live`, `pk_live`) `re P0 S`
- [ ] GitHub PAT (`ghp_`, `gho_`, `ghu_`, `ghs_`, `github_pat_`) `re P0 S`
- [ ] GitLab / Bitbucket tokens `re P1 S`
- [ ] npm token (`npm_…`) / PyPI token (`pypi-…`) / NuGet / RubyGems `re P1 S`
- [ ] Twilio (`SK…`, `AC…`), SendGrid (`SG.`), Mailgun, Postmark `re P1 S`
- [ ] OpenAI (`sk-…`), Anthropic (`sk-ant-…`), Cohere, HuggingFace (`hf_…`) keys `re P0 S`
- [ ] JWT with a real signature (3-part base64) hardcoded `re P1 S`
- [ ] Private key blocks beyond PEM (PuTTY `.ppk`, age, GPG) — 166 covers PEM `re P1 S`
- [ ] Database connection strings with inline creds (170 covers DB URLs; broaden JDBC/ODBC) `re P1 S`
- [ ] Generic high-entropy string assigned to a secret-named var (entropy heuristic) `re P1 M`
- [ ] `.npmrc` / `.pypirc` / `.netrc` with inline auth committed `cfg P1 S`
- [ ] Basic-auth creds in a URL (`https://user:pass@`) beyond DB protocols `re P1 S`

## 2 · Security — injection, crypto, deserialization (deepen)

- [ ] NoSQL injection (Mongo `$where`, `$ne` from req, string-built queries) `re P1 M`
- [ ] LDAP / XPath / template injection (SSTI: `{{` from user input) `re P2 M`
- [ ] Path traversal (`../` / `path.join(req…)` / `fs.readFile(userInput)`) `re/ast P1 M`
- [ ] Open redirect (`res.redirect(req.query…)`, `location = userInput`) `re P1 S`
- [ ] SSRF (fetch/axios/requests to a user-controlled host) `re/ast P2 M`
- [ ] Prototype pollution sinks (`obj[userKey] = …`, unsafe deep-merge) `ast P2 M`
- [ ] ReDoS-prone regex (catastrophic backtracking `(.*)*`, `(a+)+`) `re P2 M`
- [ ] ECB mode / hardcoded IV / static salt / `createCipher` (deprecated) `re P1 S`
- [ ] Weak key size (RSA <2048, etc.) `re P2 S`
- [ ] `Math.random()` for crypto beyond security-named vars (165 partial) `re P2 S`
- [ ] XXE (XML parser with external entities enabled) `re P2 M`
- [ ] Insecure deserialization beyond Python (Java `ObjectInputStream`, Ruby `Marshal.load`, PHP `unserialize`) `re P1 S`
- [ ] Timing-unsafe comparison of secrets (`===` on tokens vs constant-time) `ast P3 M`
- [ ] Hardcoded encryption key / salt `re P1 S`
- [ ] `child_process.exec` with concatenation (144 covers template; add `+`) `re P1 S`
- [ ] Shell `eval`/`source` of a variable (shell scripts) `re P2 S`

## 3 · Security — API / backend / auth (today: only 2 detectors)

> The weakest area for a tool claiming a security focus.

- [ ] Missing authentication/authorization on a route handler (heuristic) `ast P1 L`
- [ ] No rate limiting on auth/expensive endpoints `ast P2 L`
- [ ] Mass assignment (`new Model(req.body)`, `Model.update(req.body)`) `re P1 M`
- [ ] IDOR-ish: object lookup by `req.params.id` with no ownership check `ast P2 L`
- [ ] Missing input validation (route reads `req.body.x` with no schema/zod/joi) `ast P2 L`
- [ ] CSRF: state-changing route with no CSRF middleware (131 in catalog) `cfg P2 M`
- [ ] Missing security headers / `helmet()` (133 in catalog) `cfg P1 M`
- [ ] Verbose errors / debug mode enabled in prod (`app.debug = true`, `DEBUG=true`) `re P1 S`
- [ ] Permissive file upload (no type/size limit) `ast P2 M`
- [ ] GraphQL: no depth/complexity limit, introspection on in prod `re P2 M`
- [ ] Auth bypass tells (`if (user || true)`, `// auth disabled`, `skipAuth`) `re P1 S`
- [ ] Session: no `secure`/`httpOnly`/`sameSite` on cookies `re P1 M`
- [ ] Hardcoded admin/test credentials (`admin/admin`, `password123`) `re P1 S`
- [ ] Disabled CSRF/auth/validation flags (`csrf: false`, `validate: false`) `re P1 S`

## 4 · Security — supply chain & dependencies (today: 3 detectors)

- [ ] Hallucinated / slopsquatted package name (141 in catalog — the defining 2026 AI risk) `re/net P0 M`
- [ ] Known-vulnerable dependency version (needs a bundled/offline advisory DB) `net P1 L`
- [ ] Typosquat of a popular package (`reqeusts`, `loadsh`, `expresss`) `re P1 M`
- [ ] Dependency with install scripts (`postinstall`) — supply-chain exec surface `cfg P2 M`
- [ ] Lockfile / manifest drift (dep in `package.json` not in lockfile, or vice versa) `cfg P2 M`
- [ ] Deprecated / unmaintained package (last-publish age) `net P2 M`
- [ ] Git/HTTP dependency sources (`"dep": "git+http://…"`, `file:`, tarball URL) `cfg P1 S`
- [ ] Wildcard / unpinned version ranges (`"*"`, `"latest"`, `"^…"` for critical deps) `cfg P2 S`
- [ ] Duplicate-purpose deps (moment + dayjs, axios + got + node-fetch) `cfg P2 M`
- [ ] License incompatibility (GPL dep in an MIT project) `net P3 M`
- [ ] `.gitignore` missing `node_modules` / build dirs (or them being committed) `cfg P1 S`

## 5 · Security — IaC / Docker / CI/CD / cloud (today: nothing — files not even scanned)

- [ ] Dockerfile: `FROM …:latest` (unpinned base image) `cfg P1 S`
- [ ] Dockerfile: `USER root` / no non-root user `cfg P1 S`
- [ ] Dockerfile: `ADD`/`RUN curl … | sh` from a URL `cfg P1 S`
- [ ] Dockerfile: secrets in `ENV`/`ARG`, no `HEALTHCHECK`, `--no-cache` missing `cfg P2 S`
- [ ] docker-compose: `privileged: true`, host network, bind-mount of `/`, exposed DB ports `cfg P2 M`
- [ ] GitHub Actions: `pull_request_target` + `actions/checkout` (priv-esc footgun) `cfg P1 M`
- [ ] GitHub Actions: unpinned action (`@main` / no SHA), `${{ }}` script injection `cfg P1 M`
- [ ] GitHub Actions: `secrets` echoed / overly-broad `permissions` `cfg P2 M`
- [ ] Terraform/CloudFormation: public S3 bucket, `0.0.0.0/0` security group, no encryption `cfg P2 L`
- [ ] Kubernetes: `privileged`, `hostPath`, no resource limits, `latest` image `cfg P2 L`
- [ ] `.env.example` drift (vars in code not in `.env.example`) `cfg P2 M`
- [ ] World-writable file modes / `chmod 777` in scripts `re P2 S`
- [ ] nginx/apache config: missing security headers, directory listing on `cfg P3 M`

## 6 · Code quality — depth (today: 25 detectors, mostly JS-shaped)

- [ ] Functions over N lines / N params / deep nesting (complexity proxy) `ast P1 M`
- [ ] Cyclomatic complexity threshold `ast P1 L`
- [ ] Dead code: unreachable after return/throw `ast P2 M`
- [ ] Unused exports / unused imports / unused vars `ast P1 M`
- [ ] Magic numbers (065 partial) — broaden + allowlist `re P2 S`
- [ ] Deeply nested ternaries / callback pyramids `re P2 M`
- [ ] Duplicated string literals (config that should be a constant) `re P2 M`
- [ ] God function (one function doing everything) `ast P2 M`
- [ ] Boolean-trap params (`fn(true, false, true)`) `ast P3 M`
- [ ] Inconsistent naming (camel vs snake in one file) `re P3 M`
- [ ] Empty function bodies / stub returning `null`/`undefined` `re P1 S`
- [ ] `return await` / unnecessary async `re P2 S`
- [ ] Reassigning function params / `var` instead of `const`/`let` `re P2 S`
- [ ] Cross-file duplication beyond line-hash (token/AST-based clone) `ast P2 L`

## 7 · Type safety (TS) — depth

- [ ] `any` in function signatures vs locals (weight differently) `re P2 S`
- [ ] `Function` / `Object` / `{}` as a type `re P1 S`
- [ ] `// @ts-ignore` overuse (also in §0) `re P0 S`
- [ ] `as const` misuse / unsafe casts `ast P3 M`
- [ ] `// eslint-disable` for type rules `re P1 S`
- [ ] Implicit `any` (needs tsconfig + AST) `ast P2 L`
- [ ] `enum` where a union would do (style) `ast P3 M`
- [ ] Missing return types on exported functions `ast P2 M`

## 8 · Error handling — depth

- [ ] Empty catch (053 done) + catch that only `console.error`s and swallows `re P1 S`
- [ ] `.catch(() => {})` / `.catch(console.log)` — swallowed promise rejection `re P1 S`
- [ ] `throw "string"` instead of `throw new Error()` `re P1 S`
- [ ] Unhandled promise (floating promise — no await/then/catch) `ast P1 M`
- [ ] Async function with no try/catch around awaits `ast P2 M`
- [ ] Re-throwing without context / losing the stack `re P2 S`
- [ ] Generic error messages ("Something went wrong", "Error occurred") `re P2 S`
- [ ] No error boundary in a React app (101 in catalog) `cfg P2 M`
- [ ] `process.on('uncaughtException')` swallowing `re P2 S`

## 9 · Async / concurrency

- [ ] `forEach(async …)` (177 done) + `map(async)` not awaited `re P1 S`
- [ ] `await` inside a `for`/`while` loop that could be `Promise.all` `ast P2 M`
- [ ] Missing `await` on a known-async call (floating) `ast P1 M`
- [ ] `setInterval` / `setTimeout` with no `clear*` / cleanup `ast P2 M`
- [ ] Polling with no backoff / no cleanup (096 in catalog) `re P2 M`
- [ ] Race-condition "fix" via `setTimeout(…, 0/100)` (065 partial) `re P1 S`
- [ ] Shared mutable state across async boundaries `ast P3 L`

## 10 · Testing category (today: 0 dedicated detectors)

- [ ] `.only` / `.skip` (also §0) `re P0 S`
- [ ] Test with no assertion (`it('works', () => { doThing(); })`) `ast P1 M`
- [ ] Tautological assertion (149 done) — broaden (`expect(true).toBe(true)`) `re P1 S`
- [ ] `expect(…)` with no matcher (`expect(x);`) `re P1 S`
- [ ] `console.log` in tests / commented-out tests `re P2 S`
- [ ] Sleep-based flaky tests (`sleep`, `setTimeout` waits) `re P2 S`
- [ ] Snapshot-everything (`toMatchSnapshot` overuse) `re P3 S`
- [ ] Mocking the thing under test / over-mocking `ast P3 L`
- [ ] Tests that never run (no test runner wired, empty describe) `cfg P2 M`
- [ ] Hardcoded sleeps / real network calls in unit tests `re P2 S`
- [ ] Disabled assertions behind `if (false)` `re P2 S`

## 11 · Fake / placeholder features (the most AI-specific category — today: ~0)

- [ ] Hardcoded dashboard stats (`{ users: 12847, revenue: 48200 }`) `re P1 M`
- [ ] Hardcoded chart/series data arrays (124 in catalog) `re P1 M`
- [ ] Stub function returning a canned value (`return { ok: true }` / `return []`) `re P1 M`
- [ ] Mock/fake data on a production path (`mockUsers`, `dummyData`, `sampleData`) `re P1 S`
- [ ] `Math.random()` driving displayed metrics (fabricated numbers) `re P1 S`
- [ ] "Coming soon" / "Under construction" / disabled-but-shown features (043 partial) `re P2 S`
- [ ] Fabricated testimonials / logos / "trusted by" with no source (016/123) `re P2 M`
- [ ] Hollow loading state that returns null forever (136 done) `re P2 S`
- [ ] Buttons/handlers that do nothing (`onClick={() => {}}`) `re P1 S`
- [ ] Forms that don't submit anywhere (`onSubmit` preventDefault only) `ast P2 M`
- [ ] Placeholder routes (`* → <HomePage/>`, no real 404) (100 in catalog) `re P2 S`
- [ ] `lorem ipsum` (042 done) + fake emails/names (`john@example.com`, `Jane Doe`) `re P2 S`

## 12 · Performance — web / React

- [ ] `useEffect` with no dependency array (runs every render) `ast P1 M`
- [ ] `useEffect` with a missing dep (exhaustive-deps) `ast P2 L`
- [ ] Missing `key` in a `.map()` rendering JSX `re P1 M`
- [ ] Array index as `key` `re P2 S`
- [ ] Inline object/array/function as a prop (new ref each render) `re P2 M`
- [ ] No memoization of an expensive computation (`useMemo`/`useCallback` absent) `ast P3 L`
- [ ] State mutation (`state.x = …` instead of setState) `ast P2 M`
- [ ] `setState` in render / derived state anti-pattern `ast P2 M`
- [ ] Large component re-rendering (no `memo`) `ast P3 L`
- [ ] No `loading="lazy"` on below-fold images (092 partial) `re P2 S`
- [ ] `<img>` with no width/height (CLS / layout shift) `re P2 S`
- [ ] Importing a whole icon library (`import * as Icons`) `re P2 S`
- [ ] No code splitting / dynamic import for heavy routes (098) `cfg P2 M`
- [ ] Synchronous heavy work on the main thread `ast P3 M`
- [ ] No debounce on a search/filter input (095) `ast P3 M`

## 13 · Performance — backend / data

- [ ] N+1 query pattern (query inside a loop) `ast P2 L`
- [ ] `SELECT *` (176 done) + missing `LIMIT` on an unbounded query `re P1 S`
- [ ] Missing pagination on a list endpoint `ast P2 L`
- [ ] Querying inside a request loop / no batching `ast P2 L`
- [ ] No caching on an expensive/repeated computation `ast P3 L`
- [ ] Reading an entire file/stream into memory `re P2 M`
- [ ] Unbounded in-memory cache / growing array (leak) `ast P3 L`
- [ ] Sync FS / sync crypto in a request path (`readFileSync` in a handler) `re P2 M`

## 14 · Accessibility — depth (today: 3 detectors)

- [ ] Form input with no associated `<label>` / `aria-label` `re P1 M`
- [ ] Button/link with no accessible text (icon-only, no `aria-label`) `re P1 M`
- [ ] Missing `lang` attribute on `<html>` `re P2 S`
- [ ] Heading hierarchy skip (h1 → h3) `ast P2 M`
- [ ] Custom widget with no `role`/`aria-*` (082 partial) `re P2 M`
- [ ] `tabIndex` > 0 (breaks tab order) `re P2 S`
- [ ] `autoplay` media / no captions track `re P2 S`
- [ ] Positive `tabindex`, `accesskey` misuse `re P3 S`
- [ ] Color-only meaning (needs render) `render P3 L`
- [ ] Contrast failures (needs render + computed styles) `render P2 L`
- [ ] Missing skip-to-content link `re P3 S`
- [ ] `<table>` with no `<th>`/scope (data table semantics) `re P2 S`
- [ ] Click handler on a non-interactive element with no keyboard handler `ast P2 M`

## 15 · Mobile / responsive compatibility (your callout — today: nothing)

> Most precise checks need a headless render at multiple viewports; many tells
> are statically detectable.

- [ ] Missing/incorrect viewport meta (`<meta name="viewport" …>`, `user-scalable=no`) `re P1 S`
- [ ] Fixed pixel widths on layout containers (`width: 1200px`) instead of %/rem/max-width `re P1 M`
- [ ] No media queries / breakpoints anywhere in the stylesheet `re/cfg P1 M`
- [ ] Horizontal-overflow tells (`width: 100vw`, fixed wide elements) `re P2 M`
- [ ] Touch targets under 44×44px (`height: 24px` on buttons/links) `re P2 M`
- [ ] Hover-only interactions with no touch/focus equivalent `ast P2 M`
- [ ] Font sizes below ~12px on body text `re P2 S`
- [ ] Tables not wrapped/responsive (overflow on small screens) `re P2 M`
- [ ] `position: fixed` headers/footers eating mobile viewport `re P3 S`
- [ ] Images without responsive `srcset`/`sizes` or `max-width:100%` `re P2 S`
- [ ] `100vh` bug on mobile (address-bar resize) `re P2 S`
- [ ] Non-responsive grid (fixed column counts, no `auto-fit`/`minmax`) `re P3 M`
- [ ] **Live responsive audit** — headless render at 320/375/768/1024/1440 px, detect overflow, overlapping nodes, cut-off cards, tiny tap targets, unreadable text `render P2 L`
- [ ] PWA basics: no manifest, no theme-color, no apple-touch-icon `cfg P3 S`
- [ ] `prefers-reduced-motion` not respected for animations `re P3 S`
- [ ] Safe-area insets ignored (notch devices, `env(safe-area-inset-*)`) `re P3 S`

## 16 · Visual / design — depth (today: 8 detectors)

- [ ] Inline styles everywhere (no design system) `re P2 S`
- [ ] Inconsistent spacing scale (random px values, no token system) `re P3 M`
- [ ] Hardcoded hex colors instead of theme tokens `re P2 M`
- [ ] `!important` overuse (specificity wars) `re P2 S`
- [ ] `z-index` arms race beyond 9999 (103 partial) `re P2 S`
- [ ] Centered-everything layout (174 instinct) `render P3 L`
- [ ] Default shadcn/Tailwind look with no customization (Cat 5) `re P3 M`
- [ ] Emoji used as UI icons `re P2 S`
- [ ] Aurora/mesh/radial decorative backgrounds (004 done) — broaden `re P2 S`
- [ ] Staggered fade-ins on every element (137) `re P2 S`
- [ ] Skeleton-everything / shimmer overuse `re P3 S`
- [ ] **Rendered visual pass** — screenshot diff vs design tells, "looks AI-generated" scoring `render P3 L`

## 17 · Copy / content — depth (today: 7 detectors)

- [ ] More AI buzzwords ("leverage", "robust", "seamless", "cutting-edge", "elevate") `re P2 S`
- [ ] Em-dash + "it's not just X, it's Y" LLM cadence in prose `re P3 M`
- [ ] Inconsistent capitalization in UI labels `re P3 S`
- [ ] SHOUTING button labels / ALL CAPS CTAs `re P2 S`
- [ ] Passive-aggressive / cute error copy (044 done) — broaden `re P2 S`
- [ ] Placeholder copy left in (`Lorem`, `Your text here`, `Insert X`) `re P2 S`
- [ ] Fake urgency ("Only 2 left!", countdown with no backend) `re P3 M`
- [ ] Marketing superlatives with no proof ("#1", "best", "world-class") `re P3 S`

## 18 · Architecture — depth (today: 7 detectors)

- [ ] Business logic inside React components (no separation) `ast P3 L`
- [ ] Prop drilling beyond N levels `ast P3 L`
- [ ] Circular dependencies between modules `ast P2 L`
- [ ] Everything in one file / one folder (god module) — 055 is per-file; add per-dir `ast P2 M`
- [ ] No layering (controller calling DB directly) `ast P3 L`
- [ ] Global mutable singletons `ast P3 M`
- [ ] Env access scattered (not centralized config) `re P2 S`
- [ ] Mixing concerns (fetch + render + state in one place) `ast P3 L`
- [ ] `console.*` as the logging strategy (no real logger) `re P2 S`

## 19 · Documentation slop

- [ ] AI comments that restate the code (069 partial — broaden) `re P2 M`
- [ ] JSDoc/docstring that contradicts the signature (param drift) `ast P3 L`
- [ ] Thin/placeholder README (080 done) — add stale-badge / broken-link checks `cfg P2 M`
- [ ] `@param`/`@returns` for params that don't exist `ast P3 M`
- [ ] Auto-generated boilerplate left unedited (`# Getting Started`, CRA defaults) `re P2 S`
- [ ] Broken internal links in markdown docs `cfg P2 M`
- [ ] Fake/decorative badges in README (badge to nothing) `cfg P3 S`

## 20 · i18n / l10n

- [ ] Hardcoded user-facing strings (no i18n wrapper) where i18n is set up `ast P3 L`
- [ ] Date/number/currency formatting hardcoded to one locale `re P3 M`
- [ ] Concatenated translated strings (breaks RTL/grammar) `re P3 M`
- [ ] Missing translation keys / untranslated fallbacks `cfg P3 M`

## 21 · Language coverage — deepen existing (JS/TS, Python, Go, Rust)

- [ ] **JS/TS:** `==` vs `===`, `var`, `with`, `delete` on array, `parseInt` w/o radix, `JSON.parse` w/o try `re P2 S`
- [ ] **JS/TS:** Promise constructor anti-pattern, `async` IIFE leaks, `Array.prototype` mutation in render `ast P3 M`
- [ ] **Python:** bare `except` (078 done), `assert` for validation in prod (`-O` strips it), `type(x)==` vs isinstance, mutable class attrs, `global`, `*args`/`**kwargs` swallowing `re P1 S`
- [ ] **Python:** `requests` with no timeout, `open()` with no context manager, `subprocess` w/o `check`, f-string logging `re P1 S`
- [ ] **Go:** `context.TODO()`, unbuffered channel deadlocks, `defer` in a loop, naked returns, `interface{}` overuse (156 done) `re P2 M`
- [ ] **Go:** missing `rows.Close()`, ignored `defer` errors, goroutine leaks `ast P3 L`
- [ ] **Rust:** `.clone()` overuse, `unwrap()` (160 done), `Rc<RefCell>` overuse, blocking in async, `.expect("")` empty msg `re P2 M`

## 22 · Language coverage — NEW languages (today: zero detectors)

- [ ] **Java:** `printStackTrace()`, `System.out.println` debug, raw types, `== ` on strings, swallowed exceptions, `Runtime.exec`, SQL concat, `Thread.sleep` in tests `re P1 M`
- [ ] **C#:** `Console.WriteLine` debug, `async void`, `.Result`/`.Wait()` deadlock, `catch {}`, string SQL, `== null` patterns `re P1 M`
- [ ] **Ruby:** `puts`/`p` debug, `rescue` swallow, `eval`, `system`/backticks injection, `Marshal.load`, `binding.pry` left in `re P1 M`
- [ ] **PHP:** `var_dump`/`print_r`, `eval`, `$_GET`/`$_POST` into SQL, `unserialize`, `==` vs `===`, `error_reporting(0)` `re P1 M`
- [ ] **Kotlin / Swift:** force-unwrap (`!!` / `!`), `print` debug, `try!`, `GlobalScope` `re P2 M`
- [ ] **C / C++:** `gets`, `strcpy`/`sprintf` (buffer overflow), `system()`, `malloc` w/o free, `printf` debug `re P2 M`
- [ ] **Shell:** unquoted `$var`, `rm -rf $X`, `curl | sh`, `eval`, missing `set -euo pipefail` `re P1 M`
- [ ] **SQL files:** `SELECT *`, `DELETE`/`UPDATE` with no `WHERE`, `GRANT ALL`, no index hints `re P2 M`
- [ ] **HTML/CSS standalone:** inline event handlers, `!important`, missing alt, no doctype `re P2 S`
- [ ] **YAML/TOML/JSON config:** secrets, `debug: true`, permissive CORS, `0.0.0.0` binds `cfg P2 M`

## 23 · Framework-specific packs

- [ ] **Next.js:** `getServerSideProps` leaking secrets, `Image` misuse, client-secret exposure, `use client` overuse `re P2 M`
- [ ] **Vue:** `v-html` (XSS), `v-for` without `:key`, mutating props `re P2 M`
- [ ] **Svelte/SvelteKit:** `{@html}`, store misuse `re P3 M`
- [ ] **Angular:** `bypassSecurityTrust*`, `any` in templates, no `OnPush` `re P3 M`
- [ ] **Django:** `DEBUG=True`, `mark_safe`, raw SQL, `ALLOWED_HOSTS=['*']`, no CSRF `re P1 M`
- [ ] **Flask/FastAPI:** `debug=True`, `render_template_string` SSTI, no validation `re P1 M`
- [ ] **Rails:** `html_safe`, `raw`, mass-assignment, `permit!`, `eval` `re P1 M`
- [ ] **Spring:** `@CrossOrigin("*")`, SpEL injection, `printStackTrace`, no validation `re P2 M`
- [ ] **Express:** missing helmet, `app.use(cors())` open, no rate limiter `re P1 M`

## 24 · Engine / architecture (lift the regex ceiling)

- [ ] **AST tier** — optional `--ast` mode (per-language parser) for complexity, taint, dead code, cross-file `ast P1 L`
- [ ] **Dataflow / taint-lite** — source→sink for injection rules (real, not heuristic) `ast P2 L`
- [ ] **Cross-file analysis** — call graph, unused exports, real duplication (token clone) `ast P2 L`
- [ ] **Custom rules API** — `customRules` in `.slopscore.json` (id, regex, severity, fix) `cfg P1 M`
- [ ] **Plugin system** — load community rule packs `cfg P3 L`
- [ ] **Multi-line / template-literal masking** — backtick strings spanning lines `re P2 M`
- [ ] **Per-finding confidence in the score** — weight low-confidence less (today it's display-only) `re P2 S`
- [ ] **Incremental cache** — only re-scan changed files between runs `cfg P2 M`
- [ ] **Parallel scanning** — worker threads for big repos `re P2 M`
- [ ] **Streaming / very-large-repo mode** `re P3 M`

## 25 · CLI / DX

- [ ] `--changed` / `--since <ref>` — scan only files in a passed diff list (CI speed) `cfg P1 M`
- [ ] `--fix` breadth — many more safe autofixers (still behavior-preserving) `re P1 L`
- [ ] `--interactive` triage TUI (accept / skip / suppress each finding) `re P2 L`
- [ ] Config schema validation (typo'd `.slopscore.json` key → warn, not silent) `cfg P1 S`
- [ ] `--explain` improvements (show the regex, examples, links) `re P3 S`
- [ ] `--quiet` / `--verbose` / `--summary-only` output modes `re P3 S`
- [ ] `slopscore doctor` — diagnose config, ignored paths, stale suppressions `re P2 M`
- [ ] Per-directory scores / monorepo package-level scoring `cfg P2 M`
- [ ] Exit-code granularity per category (fail only on security, etc.) `re P2 S`
- [ ] `--baseline` auto-create on first CI run `re P2 S`

## 26 · Output / reporting

- [ ] HTML dashboard report (per-rule trends, top offending files, drill-down) `re P2 L`
- [ ] SARIF enrichment — `helpUri` per rule, fix snippets, `partialFingerprints` `re P2 M`
- [ ] PR comment bot (richer than the markdown sticky) — diff-scoped findings `cfg P2 M`
- [ ] Trend dashboard beyond the sparkline (hosted or local HTML over `--history`) `re P3 L`
- [ ] JUnit XML output (for CI test-report panels) `re P3 S`
- [ ] "Slop budget" per directory / per category gates `cfg P2 M`
- [ ] Confidence + category badges in every output format `re P3 S`

## 27 · Integrations

- [ ] **VS Code extension** — inline squiggles + status-bar Slop Score (via SARIF/LSP) `P1 L`
- [ ] **LSP server** — works in any editor `P2 L`
- [ ] **GitHub App / Action (published)** — one-click PR gate + checks UI `P2 L`
- [ ] **Pre-commit framework hook** (publish a `.pre-commit-hooks.yaml`) `P2 S`
- [ ] **GitLab CI / CircleCI / Jenkins** templates `P3 S`
- [ ] **Danger.js plugin** `P3 M`
- [ ] **Cursor / Claude Code / Codex** native slash-command integration `P2 M`

## 28 · Agentic / protocol bridge

- [ ] `slopscore audit --agent` — drive an LLM through the ~96 non-automated patterns `P2 L`
- [ ] **Live visual + responsive pass** — headless browser, screenshots at breakpoints, design-tell scoring (bridges the two halves) `render P2 L`
- [ ] Auto-fix-then-verify loop (agent applies fixes, re-scans, reports) `P2 L`
- [ ] Protocol → machine-readable JSON (so agents parse, not just read prose) `P2 M`

## 29 · Benchmarking / calibration / trust

- [ ] **Published benchmark corpus** — back the "4.4 vs 14 /kLOC" claim reproducibly `P1 L`
- [ ] False-positive / false-negative test corpus (clean repos + slop repos) `P1 M`
- [ ] Per-rule precision/recall tracking over real repos `P2 L`
- [ ] Severity/confidence calibration per project type (presets, expanded) `P2 M`
- [ ] Comparison harness vs ESLint/Semgrep/gitleaks (where we overlap) `P3 M`

## 30 · Honesty / positioning fixes (do before scaling marketing)

- [ ] Soften "best-in-class security pass" → "fast security first-pass" until depth matches `P0 S`
- [ ] Back the 4.4-vs-14 benchmark with a corpus, or drop the number `P1 S`
- [ ] Scope "any language" claims to what actually has detectors `P1 S`
- [ ] Document the regex ceiling prominently (what it can't do) `P1 S`
- [ ] Clarify which catalog categories are web-specific (presets help) `P2 S`

## 31 · Tool-quality infra (slopscore on slopscore)

- [ ] Mutation testing of the detectors themselves `P3 M`
- [ ] Fuzz the scanner (random files → never crash, never hang) `P2 M`
- [ ] Property test: scanning a file twice is deterministic `P2 S`
- [ ] Performance budget test (scan N kLOC under T ms) `P2 S`
- [ ] Golden-output tests for every report format `P2 S`
- [ ] A "no rule may FP on this clean-code corpus" CI gate `P1 M`

---

## Suggested sequencing

- **1.8.0 — "Table stakes":** §0 easy-misses pack + §10 testing basics + config-schema validation + soften §30 wording. Cheapest credibility win.
- **1.9.0 — "Security depth":** §1 secret breadth + §4 slopsquatting + §5 Docker/CI scanning. Makes the security claim true.
- **1.10.0 — "Anti-slop signature":** §11 fake-features + §12 React perf + §19 doc slop. Doubles down on the unique angle.
- **1.11.0 — "Reach":** §22 new languages (Java/C#/Ruby/PHP) + §23 framework packs.
- **2.0.0 — "Beyond regex":** §24 AST tier + §15/§28 live visual+responsive pass + §29 benchmark corpus. The ceiling lift.

> Count: ~200 line items. None of §0–§23 require leaving the zero-dependency, regex
> design except where tagged `ast` / `render` / `net`. Those three tiers are the real
> 2.0 bets; everything else is incremental and shippable today.
