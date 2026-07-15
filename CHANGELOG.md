# Changelog

All notable changes to slopscore are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [2.4.0] — 2026-07-16

> Two major additions: AST cross-file clone detection and an HTML report.
> 188 → **189 detectors**, catalog **285 patterns**.

### Added
- **`286` Structural clone detection** (opt-in `--ast`, cross-file). Fingerprints each
  function by its AST *shape* (node-type sequence, ignoring names/literals), so a
  copy-pasted-then-renamed function is caught — even across files, even with different
  variable names and constants. Reports only functions duplicated across ≥2 files
  (min structural size, to avoid trivially-similar small functions).
- **`--format html`** — a **self-contained HTML dashboard** (inline CSS, no scripts, no
  assets): score banner, severity/category breakdown, and a full findings table with
  fixes. Great with `--out report.html` for PR artifacts and sharing. All content escaped.

## [2.3.0] — 2026-07-16

> Security-hardening wave — deeper crypto/injection detection **and** a more secure
> tool. 185 → **188 detectors**, catalog **284 patterns**.

### Added — detection
- **`283` Weak / misused cryptography** — ECB mode, DES/3DES/RC4/RC2, and undersized RSA
  keys (`modulusLength: 512/1024`). AES-GCM/CBC and RSA ≥2048 are not flagged.
- **`284` JWT `alg: "none"`** — the signature-bypass footgun; a pinned `["RS256"]` is fine.
- **`285` XXE** — XML parsed with external entities / DTD resolution enabled
  (`noent: true`, `processEntities`, `libxml_disable_entity_loader(false)`, `resolveExternalEntities`).
- **Prototype pollution** is now a taint sink (`282`, `--ast`): `obj[taintedKey] = …` where the
  key is user-derived (a fixed key with a tainted value is correctly not flagged).

### Hardened — the tool itself
- **Provenance-signed releases**: a `release.yml` workflow publishes from CI with
  `npm publish --provenance` (a signed, verifiable attestation tying the tarball to this
  repo + commit) — supply-chain integrity for a security tool.
- **SECURITY.md corrected**: documents that the only subprocess ever spawned is `git`
  (for `--changed`/`--since`, in your own repo) and that `--ast` uses optional peer parsers.

## [2.2.0] — 2026-07-16

> **Real taint analysis** — the accurate source→sink tracking regex can't do. `--ast`
> now follows user input *across variable assignments* into dangerous sinks, catching
> injection flows the per-line rules miss. 185 detectors / 281 patterns.

### Added
- **`282` Tainted user input flows into a dangerous sink** (opt-in `--ast`, intra-procedural).
  Tracks sources (`req`/`request`/`process.argv`/`process.env`/`location`/`document.cookie`)
  through assignments and destructuring (with transitive aliasing) into sinks: shell
  `exec`/`execSync`, SQL `.query`/`.execute` (query-string arg only — parameterized params
  arrays are safe), `fs` path APIs, `res.redirect`, and `.innerHTML =`.
- **Deliberately additive:** fires only when a tainted *variable* reaches a sink
  (`const id = req.query.id; … db.query(id)`) — the cross-line case the regex rules can't
  see. Direct inline `req.x` stays owned by the existing detectors (072/144/253/254/071),
  so there's no double-reporting. Exception-guarded like the rest of the AST pass.

## [2.1.1] — 2026-07-14

### Fixed (found in a rigorous bug hunt)
- **`058` missed OpenAI `sk-proj-` and Anthropic `sk-ant-` key formats** — the hyphen
  broke `sk-[A-Za-z0-9]{16,}`. Now matches `sk-(proj-|ant-|svcacct-)?…` (kebab-case class
  names like `sk-loading-spinner` are still not flagged).
- **AST analysis is now exception-guarded** — a pathologically deep (but parseable) file
  could stack-overflow inside the walker and crash the whole scan; it now degrades to no
  findings for that file instead of taking down the run.
- **Invalid `--format` now errors (exit 2)** instead of silently falling back to terminal
  output — matching `--fail-on`/`--min-confidence`. (`--format md` still aliases markdown.)

## [2.1.0] — 2026-07-14

> `--ast` now covers **TypeScript and JSX** — where most modern (and most AI-generated)
> code actually lives. Added `@babel/parser` as a second *optional* peer dependency
> (JS + JSX + TS); acorn stays the lightweight JS-only fallback. Core still zero-runtime-dep.

### Added
- **`--ast` for `.ts` / `.tsx` / `.jsx` / `.mts` / `.cts`** via `@babel/parser`. The existing
  metrics (`278` long function, `279` cyclomatic complexity, `280` nesting, `281` params) now
  apply to TypeScript and JSX, not just plain JS.
- Parser selection is automatic: `@babel/parser` if installed (JS/TS/JSX), else `acorn` (JS).
  Missing both → `--ast` prints a hint naming the right install for your language; the regex scan is unaffected.

## [2.0.0] — 2026-07-14

> **The AST tier — opt-in, still zero-runtime-dependency.** slopscore now has a
> `--ast` mode that parses JS with **acorn (an *optional* peer dependency)** to compute
> the accurate function-level metrics regex genuinely can't. The core scanner remains
> zero-runtime-dependency: `npx slopscore` installs nothing; `--ast` asks you to add acorn.

### Added
- **`slopscore scan --ast`** — accurate AST metrics for `.js`/`.mjs`/`.cjs`:
  - `278` Long function · `279` High cyclomatic complexity · `280` Deep nesting · `281` Too many parameters.
  - Off by default (they never inflate the default score or the self-scan); opt-in per run.
  - If acorn isn't installed, `--ast` prints an install hint and the regex scan continues unaffected.
  - Files acorn can't parse (TS/JSX for now) are skipped silently — no crash. **184 detectors / 280 patterns.**

### Changed (honesty)
- Wording is now precise: **zero *runtime* dependencies** in the core; `acorn` is an
  optional peer dependency (dev-installed for the project's own tests) used only by `--ast`.
  The comparison table note updated — `--ast` provides real complexity metrics; deeper
  cross-file/taint analysis still belongs to Semgrep/CodeQL.

### Why major
No breaking API change, but the dependency model gains an (optional) peer and a new
analysis mode — a significant enough shift to mark 2.0.

## [1.14.0] — 2026-07-14

### Added
- **Broader secret detection** (`058`/`192`): Google OAuth client secret (`GOCSPX-`),
  Shopify (`shpat_`/`shpss_`), Square (`sq0atp-`/`sq0csp-`), DigitalOcean (`dop_v1_`),
  Discord webhooks, and Telegram bot tokens — all distinctive prefixes, near-zero FP.
- **`277` Duplicate-purpose dependencies** — two libraries doing the same job
  (moment + dayjs, axios + got, lodash + underscore, uuid + nanoid). 180 detectors / 276 patterns.

## [1.13.0] — 2026-07-14

> Supply-chain depth via structured `package.json` analysis (accurate, JSON-parsed,
> low false-positive). 176 → **179 detectors**, catalog **275 patterns**. P/R still 100/100.

### Added — supply chain (`src/manifest.js`)
- `274` **Unpinned dependency version** — `"*"` / `"latest"` floats to whatever the registry serves next.
- `275` **Non-registry dependency source** — git / http / tarball / local / github-shorthand deps are unaudited and mutable.
- `276` **Lifecycle install script** — `preinstall`/`install`/`postinstall` run arbitrary code on every `npm install`.

(Note: attempted a zero-dependency structural complexity pass but deferred it — accurate
function/complexity detection needs a real parser; a hand-rolled version misclassifies
control blocks as functions and produces noisy findings. That remains the AST 2.0 tier.)

## [1.12.1] — 2026-07-14

### Fixed (false positives found by running the teardown on real repos)
- **`254` open redirect** now requires the redirect target to *start* with user input
  (`res.redirect(req.query.next)`), so a fixed internal prefix + id
  (`res.redirect("/pet/" + req.pet.id)`) is no longer flagged.
- **`270` SSTI** no longer fires on the `def render_template_string(...)` definition
  (e.g. inside Flask itself) — only on calls.

## [1.12.0] — 2026-07-14

> Language depth + more code-review/security coverage. 167 → **176 detectors**,
> catalog **272 patterns**. Precision/recall (26-file labeled corpus) still **100/100**.

### Added — language depth
- `265` Go `context.TODO()`, `266` Java `String == ` (use `.equals`), `267` C# empty catch,
  `268` Ruby `eval`, `269` PHP superglobal (`$_GET`/`$_POST`) used directly in a sink,
  `270` Python SSTI (`render_template_string`).

### Added — security / code review
- `271` Timing-unsafe comparison of a secret/token (use constant-time compare).
- `272` Sensitive data written to logs (credentials/tokens/`req.body`).
- `273` CORS reflects any origin (`cors({ origin: true })`).

### Changed
- **Near-duplication (`068`) now normalizes string/number literal *contents*** before hashing,
  so a block copy-pasted then tweaked (different message/constant) registers as a near-duplicate,
  not just byte-identical copies. Still low-confidence and per-rule capped.

## [1.11.0] — 2026-07-14

> Breadth + depth: four more languages and a set of taint-gated code-level security
> detectors. 155 → **167 detectors**, catalog **263 patterns**. The precision/recall
> corpus grew to 26 labeled files (13 seeded vulns + 10 hard negatives) and still holds
> **100% precision / 100% recall** at medium+ confidence.

### Added — code-level security (taint-gated, so they fire only with a request/user source)
- **`253` Path traversal** — filesystem access (`readFile`/`sendFile`/`unlink`/…) from `req`/`request`.
- **`254` Open redirect** — `res.redirect` / `location =` to user input.
- **`255` SSRF** — `fetch`/`axios`/`http.get` to a user-controlled URL.
- **`256` NoSQL injection** — `$where`, or a `$ne`/`$gt`/… operator fed from a request.
- **`257` Mass assignment** — `new Model(req.body)` / `Model.update(req.body)` / `Object.assign(x, req.body)`.
- **`258` Insecure cookie flag** — `httpOnly: false` / `secure: false`.
- **`259` Deprecated cipher** — `createCipher`/`createDecipher` (weak key/IV; use `createCipheriv` + GCM).

### Added — more languages
- **Kotlin** `260` force-unwrap `!!`, **Swift** `261` `try!`, `262` `println`/`print` debug (Kotlin/Swift).
- **C/C++** `263` unsafe string funcs (`gets`/`strcpy`/`strcat`/`sprintf`), `264` `system()` command exec.
  (`.c`/`.cpp`/`.cc`/`.cxx`/`.h`/`.hpp` are now scanned.)

## [1.10.0] — 2026-07-14

### Added
- **Taint-lite for injection/XSS rules** (`071`, `072`, `144`, `171`). A match keeps
  full confidence only when a user-/externally-derived source (`req`, `params`, `body`,
  `input`, `query`, …) is present on the line; otherwise it's still reported but at a
  downgraded confidence (likely a constant/internal value). Cuts false-positive weight on
  safe interpolation **without gating detection** — a real `${req.query.id}` still scores full.
- **Detector `252` — untrusted file content echoed to a terminal/log.** Flags a file read
  piped straight into `console.*` / `process.stdout|stderr.write` — the control-character
  injection class slopscore hardened in its own output in 1.9.3 (dogfooding). (155 detectors / 251 patterns.)
- **Published precision/recall benchmark** (`npm run pr`) over a labeled corpus of seeded
  vulnerabilities + tempting-but-safe hard negatives (parameterized SQL, `textContent`, env
  secrets, guarded `JSON.parse`). **100% precision / 100% recall** at medium+ confidence,
  guarded by a regression test. A reproducible check on the tool's own false-positive rate.

## [1.9.4] — 2026-07-14

### Security / robustness (hardening the scanner itself)
- **customRules ReDoS guard.** A user-supplied regex in `.slopscore.json` runs against
  every line, so a catastrophic-backtracking pattern could hang the scan. Nested-quantifier
  shapes (`(a+)+`, `(.*)*`, `(\d+)*`) are now detected, the rule is skipped, and the CLI warns.
- **Non-UTF-8 / binary hardening.** The scanner already skipped NUL-byte files; it now also
  skips files that decode to a high density of U+FFFD replacement chars (a non-UTF-8 file read
  as UTF-8), which otherwise produce garbage findings.

## [1.9.3] — 2026-07-14

### Security
- **Terminal control-character injection in finding snippets (fixed).** A finding's
  `snippet` is copied verbatim from a scanned (untrusted) file and then printed to the
  terminal and embedded in the JUnit / JSON / SARIF / Markdown / agent reports. A scanned
  file containing ANSI/OSC escape sequences (e.g. `\x1b[2J` clear-screen, cursor moves, or
  exploitable terminal sequences) could therefore drive the reader's terminal. Snippets are
  now stripped of escape sequences and C0/C1 control characters (tab preserved) at the
  source, so every output sink is covered. New `src/sanitize.js` + `test/sanitize.test.js`.

## [1.9.2] — 2026-07-08

> Real-world calibration. Running slopscore on a spread of well-known repos (via
> `npm run teardown`) showed the headline verdict was too alarming on mature,
> hand-written code — soft heuristics (`var`, `==`, duplication, design tells) piled
> up and pushed respected libraries toward "vibe-coded." This release makes the score
> reflect the STRONG signal.

### Changed
- **Confidence-weighted scoring.** A finding's contribution to the Slop Score is now
  scaled by its confidence: `high ×1 · medium ×0.5 · low ×0.25`. Precise detectors
  (secrets, injection, empty catch) count full; heuristic idioms count a fraction.
  True counts are unchanged; only the weighted headline is affected. On a spread of
  well-known libraries this moved the default verdict from "Heavy/Vibe-coded" to
  Clean–Mild — matching the high-confidence gate — while `examples/slop.tsx` stays
  Vibe-coded.
- **`docs/` is a non-production zone.** Findings in generated API docs / guides are
  reported, not scored (fixes a large false-positive class — e.g. jsdoc HTML output).
- **`054` (`any`) and `077` (double assertion) are medium confidence** — context-
  dependent style signals (routine in advanced-TS type machinery), not precise tells.

### Fixed
- **`071`** skips `.d.ts` type declarations (a type mentioning `innerHTML` is not code).

## [1.9.1] — 2026-07-08

> False-positive hardening, found by running slopscore on real repositories
> (a new `npm run teardown` tool). Fewer false alarms on mature, hand-written code.

### Fixed
- **`058` (hardcoded secret):** a value containing whitespace is a dictionary phrase,
  not a secret — no longer flags demo values like `secret: "keyboard cat"`. High-entropy
  tokens (and all provider-prefixed keys) still fire.
- **`244` (rm -rf on a variable):** exempts the safe bash idiom `rm -rf "${VAR:?}"`.
- **`198` (unguarded `JSON.parse`):** exempts an inline `try`, and downgraded to low
  confidence — a regex can't see a surrounding try/catch, so it's a soft, gate-able nudge.
- **`223` (`var`) and `224` (`==`):** downgraded to **low confidence**. They're pre-ES6
  hand-written tells, not AI-slop signals — gate them out with `--min-confidence medium`.

### Added
- `npm run teardown` (`scripts/scan-repos.js`) — scan a set of well-known packages and
  print a Slop-Score table (with a fair high-confidence column). A reporting tool, not CI.

## [1.9.0] — 2026-07-07

> The big coverage wave: **69 new detectors (85 → 154)** and the catalog grows to
> **250 patterns**, with the scanner reaching into config/IaC files and six more
> languages — plus a pre-ship gate, `doctor`, `--changed`, config validation, a
> custom-rules API, and JUnit output. Every headline count is reconciled by a test,
> the scanner still passes its own scan, and it stays **zero-dependency**.

### Added — detectors (154 total, catalog now 250)
- **Tier-0 easy misses** (182–190): merge-conflict markers, bare `@ts-ignore`/`@ts-expect-error`,
  blanket `eslint-disable`, `debugger` (AUTO-fix), focused/skipped tests, non-null-assertion abuse,
  `@ts-nocheck`, `process.exit()` in library code.
- **Secret breadth** (192–194): GCP/GitLab/GitHub/Stripe/npm/PyPI/SendGrid/HuggingFace/Twilio
  provider tokens, Slack webhooks, hardcoded JWTs, and credentials embedded in URLs.
- **New `robustness` category** (195–198): `parseInt` without a radix, `RegExp` built from user input,
  unchecked `.find()`/`.match()`/`querySelector()` dereference, `JSON.parse` of external data.
- **IaC / Docker / CI scanning** (199–206): the scanner now reads Dockerfiles, docker-compose,
  Terraform, and GitHub Actions workflows — unpinned base images, `USER root`, remote-exec pipes,
  baked secrets, insecure compose settings, `pull_request_target`, unpinned actions, `${{ }}` injection.
- **New `testing` category** (207–210): tautological assertions, matcher-less `expect()`, sleep-based
  waits, `if (false)` dead code (test-scoped where appropriate).
- **New `fake` category** (211–217): hardcoded dashboard stats, mock data on production paths,
  Math.random-driven metrics, empty handlers, canned-success stubs, "coming soon", sample identities.
- **Error handling / async** (218–221): swallowed promise rejections, `throw "string"`, generic
  "something went wrong", global `uncaughtException` swallow.
- **Code quality / TS depth** (222–226): `Function`/`Object` as a type, `var`, loose `==`
  (exempting the `== null` idiom), empty function bodies, `return await`.
- **New `mobile` category + a11y/visual/copy** (227–234): shouting CTAs, unsupported superlatives,
  `<html>` without `lang`, positive `tabIndex`, zoom-disabling viewports, sub-12px fonts, `100vw`, `!important`.
- **Six more languages + framework packs** (235–251): Java, C#, Ruby, PHP, Shell, SQL, plus Vue
  `v-html`, Python `debug=True`, Rails `html_safe`/`raw`, Angular `bypassSecurityTrust*`.

### Added — CLI / engine / reporting
- **`slopscore gate`** / **`--gate ship`** — a pre-ship gate that fails only on production
  security + robustness crit/major, with a ship-readiness verdict.
- **`slopscore doctor`** — diagnoses config, ignored paths, stale suppressions, detector count.
- **`--changed` / `--since <ref>`** — scan only files git reports as changed (CI speed).
- **Config-schema validation** — an unknown `.slopscore.json` key now warns instead of being
  silently ignored.
- **`customRules`** in `.slopscore.json` — define house detectors (id/pattern/severity/fix) without forking.
- **`--format junit`** — JUnit XML for CI test-report panels; SARIF gains `partialFingerprints`.

### Changed / fixed
- The comment mask now classifies **regex-literal interiors** and **multi-line template literals**
  as string content, removing a class of false positives for code-only rules.
- `bin/slopscore.js` init/scaffold logic extracted to `src/scaffold.js`; config/git helpers to
  `src/diagnostics.js` — keeping every source file honest against the tool's own god-file rule.

## [1.8.0] — 2026-06-30

> Adoption fixes from a real-world run on a ~500k-line codebase: the detectors were
> right, but the verdict logic buried the findings that matter. These make the output
> CI-grade on mature, opinionated codebases.

### Added
- **Honor inline `eslint-disable`** (#41). A finding the project already, deliberately,
  signed off via `// eslint-disable-(next-)line <rule>` is no longer re-reported —
  today for `052` (`no-console`) and `054` (`@typescript-eslint/no-explicit-any`).
  **Security rules carry no eslint mapping**, so an `eslint-disable` — even a bare
  all-rules one — can never silence `eval`, SQLi, a hardcoded secret, etc.
- **Agent mode is now discoverable.** Every terminal run footer points to
  `slopscore scan --format agent` (the compact, fix-authority-tagged output built for
  AI agents) + `slopscore protocol`; the generated `AGENTS.md` tells agents to *prefer*
  agent mode.

### Changed
- **Repeated findings are clustered** so a high-volume, low-signal detector (e.g. `068`
  on a design system's repeated markup) can't wall the output and bury the few findings
  that matter. A rule is shown a few times inline, then collapsed into one
  `+N more [068] … across M files — likely a repeated pattern; "rules": { "068": "off" }`
  line. The real criticals surface first. (The weighted score was already per-rule
  capped; this fixes the *display*.)
- **A god file (`055`) is never CRITICAL.** It's a maintainability smell on a line-count
  heuristic — now capped at **major**, consistent with the medium confidence it reports
  (was escalating to critical past 800 lines).

## [1.7.3] — 2026-06-30

### Changed
- **Docs refreshed to match the tool.** README demo output, the auto-fix rule list,
  the test count, and the "what it detects" table now reflect 1.7.x reality (security
  expansion, performance + language-specific detectors, presets, the verified-safe fix
  engine). `package.json` description updated from "162-pattern" to the current
  **85 detectors / 181-pattern** framing, with `homepage`/`bugs` links — so the npm
  page matches the repo. No code changes.

## [1.7.2] — 2026-06-30

### Fixed
- **`163` no longer false-positives on a `session` parameter.** A clean-install test of
  the published 1.7.1 caught it: `def active(session, verify=False)` fired the critical
  "TLS verification disabled" rule, because `session` (a very common DB-session param
  name) had been treated as an HTTP-client signal. `163` now requires a real HTTP client
  (`requests`/`httpx`/`aiohttp`/`urllib3`), a `.get(…verify=False)` method call,
  `.verify = False`, or `verify_ssl=False` — a generic `verify=False` param is left alone.
  Real bypasses (`requests.get(…, verify=False)`, `session.get(…, verify=False)`,
  `session.verify = False`, `httpx.Client(verify=False)`) are still caught.

## [1.7.1] — 2026-06-30

### Fixed
- **QA hardening — eliminated false positives and fix-engine corruption** (from a
  4-agent adversarial sweep against realistic clean code, plus an independent
  verification pass).
  - **Language-aware masking:** the comment mask was JS-only, so Python `#` comments
    and docstrings — and any string literal — were scanned as live code. New tri-state
    mask (code/comment/string) with Python `#`/docstring support; `codeOnly` rules
    (`052 106 144 152 153 155 159 172 178 179 180 181`) only fire in real code; `057`
    is comments-only (a `TODO` enum value no longer trips it).
  - **Fix engine can no longer corrupt code:** removed the deletion fixers for `178`
    (Python `print` → empties a block), `180` (Rust `dbg!` → drops a tail expression),
    `158` (Go `fmt.Print` → deletes real output); `152/179` rewriters are string-safe;
    a removal guard refuses to orphan a braceless control body.
  - **Detector precision:** `172` ignores method calls / definitions / TS signatures
    named `eval`; `106` ignores a `confirm()` wrapper; `163` needs an HTTP-client on the
    line (not a generic `verify=False` param); `171` needs real SQL (not `a + " and " + b`);
    `176` matches upper/lower SQL only; `142` exempts date-pinned model ids; `152/179`
    skip ORM `Column == None`/`== True`.
  - **Test-zone detection** for pytest (`test_*.py`/`*_test.py`), Go (`*_test.go`), Ruby.
  - **CLI:** `--max 0` prints zero; color auto-off when not a TTY / for `--out`; `--out`
    to a bad path exits 2 cleanly; typo'd `--category`/`--fail-on`/`--min-confidence`
    exit 2; `--ascii` fully ASCII-ifies the by-rule line.

## [1.7.0] — 2026-06-30

Security-and-reach release: a best-in-class security pass, performance detectors,
deeper Python/Go/Rust coverage with opt-in fixers, project presets, and automatic
agent adoption via `AGENTS.md`. Catalog grows from 162 to **181 patterns / 85 detectors**.

### Added
- **Agent auto-adoption — `slopscore init` now writes `AGENTS.md`.** Any coding agent
  that reads `AGENTS.md` / `CLAUDE.md` (Cursor, Codex, Claude Code, Aider, Windsurf,
  Cline) now auto-discovers the protocol: load `npx slopscore protocol`, follow it, and
  gate on `npx slopscore scan` before finishing — no need to tell the agent "use
  slopscore" each session. Idempotent: appends to an existing file (guarded by a marker)
  instead of overwriting.
- **Security detector expansion — 12 new high-signal checks (163–174).** TLS/cert
  verification disabled (`rejectUnauthorized: false`, `verify=False`,
  `InsecureSkipVerify`), weak hashing for security (MD5/SHA-1, scoped so a content
  checksum isn't flagged), insecure randomness for tokens/OTPs (`Math.random`),
  hardcoded private keys (PEM), insecure Python deserialization (`pickle.loads`,
  `yaml.load`), wildcard CORS origin, `target="_blank"` without `rel="noopener"`
  (auto-fixable), credentials in connection strings, SQL by string concatenation,
  `eval`/`new Function`, cleartext HTTP calls, and unverified JWTs (`alg: none` /
  `verify=False`). Catalog is now **174 patterns / 78 detectors**.
- **`--category <names>` focus filter.** Run a focused audit — e.g.
  `slopscore scan . --category security` — scoring and reporting only the categories
  you name (comma-separated).
- **Project presets (`--preset` / `"preset"` config).** Tune coverage to the project so
  you're not fighting irrelevant findings: `library`/`backend` turn off the visual, copy,
  and a11y categories; `cli` also silences stdout-debug rules; `web`/`marketing` keep
  everything on; framework aliases (`mui`, `tailwind`, `chakra`, `mantine`, `emotion`,
  `styled-components`, `vanilla-extract`) confirm a web UI (the visual detectors are
  framework-agnostic). Your explicit `rules` always win over the preset.
- **Performance detectors (new `performance` category).** `175` deep-clone via
  `JSON.parse(JSON.stringify())`, `176` `SELECT *` over-fetch, `177` `forEach` with an
  async callback (unawaited work / swallowed errors). `093` (whole-library import) is
  now grouped under performance too.
- **Deeper Python / Go / Rust coverage (178–181).** `178` Python `print()` debugging,
  `179` Python `== True` / `== False`, `180` Rust debug macros (`dbg!`/`println!`/…),
  `181` Go `panic()` in library code. Catalog is now **181 patterns / 85 detectors**.
- **Opt-in fixers.** `slopscore fix` still applies only the behavior-preserving AUTO
  fixers by default, but propose-level fixers (Python `print` removal `178`, `== True`
  cleanup `179`, Rust debug-macro removal `180`) can now be applied explicitly with
  `--only <id>` — so the language fixes are available without auto-rewriting code that
  might be intentional.

### Changed
- The count-invariant test now derives the catalog total instead of hardcoding it,
  so growing the catalog only requires updating the prose it pins.

## [1.6.0] — 2026-06-30

Trust-and-coverage release, implementing the improvements from a real production-app
evaluation: the score is harder to skew, the visual detectors understand CSS-in-JS,
there's an auto-fixer, and output is safe on Windows.

### Changed
- **Scoring trust — no single detector defines the verdict.** The weighted score now
  caps each rule's contribution at 10 findings, so a repo with 45 repeated-markup
  blocks no longer reads as catastrophic on the strength of one detector. True counts
  are still reported in full; the cap only affects the headline weight, and the banner
  says so when it engages.
- **068 is style-aware.** A duplicated block that is mostly JSX/CSS-in-JS markup (MUI
  `sx`, className soup, status pills) scores **minor** ("repeated markup/style") — a
  component-extraction, not a logic bug. Duplicated *logic* still scores **major**.

- **Visual detectors now see CSS-in-JS, not just Tailwind.** Rules 001 (purple
  gradient), 003 (glassmorphism), and 008 (gradient text) previously matched only
  Tailwind classes and kebab-case CSS, so a React + MUI/styled/emotion app that ships
  glassmorphism everywhere scored zero on the visual category. They now also match
  camelCase CSS-in-JS (`backdropFilter: "blur(…)"`, `WebkitBackgroundClip: 'text'`) and
  theme-token gradients (`linear-gradient(…, #8b5cf6, …)`), and apply to `.ts` files
  (theme/styled modules), not only `.tsx`. 001 requires gradient context for the
  expanded hexes, so a neutral gradient is not flagged.

### Added
- **Per-finding confidence + `--min-confidence`.** Every finding now carries a
  `confidence` (high / medium / low) separate from severity — precise syntactic
  detectors are high; idiom-matching design/copy tells and the line-hash dup
  heuristic (068) are softer. `--min-confidence high|medium|low` filters before
  scoring, so a CI gate can require only high-confidence signal. Shown inline
  (`~medium confidence`) and carried in JSON / agent / SARIF output.
- **Stale-suppression detection.** A `slopscore-disable` directive whose finding no
  longer exists is now surfaced ("N stale suppressions — remove the directive") so
  dead directives don't pile up. Directive parsing is anchored to the first comment,
  so prose that merely documents the syntax isn't mistaken for a real directive.
- **`slopscore fix` — apply the safe fixes.** A new command that auto-applies the
  deterministic, behavior-preserving fixes for a subset of the 🟢 AUTO rules: `052`
  (remove a standalone `console.log`), `069` (remove a full-line step-narration comment),
  `081` (add `<img alt="">`), `152` (Python `== None` → `is None`), `158` (remove a Go
  `fmt.Print` debug line). `--dry-run` previews; `--only`/`--except` scope it by rule. It
  is conservative on purpose — a multi-line call, a trailing comment, or anything needing
  a name/destination is left for a human. Idempotent.
- **Per-rule breakdown in the summary.** The score banner now prints `by rule: 068 ×45 ·
  055 ×2`, so you can see at a glance which detector is driving the number.

### Fixed
- **078 no longer false-positives on a JS/TS object key named `except`.** Python's bare
  `except:` is statement-leading, so that branch is now anchored to line start; a JS
  object literal like `{ except: x }` is no longer mistaken for broad exception handling.
- **Windows / legacy-terminal output.** slopscore auto-detects consoles that can't render
  Unicode (legacy `cmd`/PowerShell on a non-UTF-8 code page) and falls back to ASCII
  glyphs for the banner, severity markers, and trend sparkline — `--ascii` / `--unicode`
  force it either way. New `--out <file>` writes the report as UTF-8 straight from Node,
  so it can't be mangled into UTF-16 by a shell's `>` redirect. stdout is pinned to UTF-8.

## [1.5.0]

### Added
- **Language coverage — Go & Rust.** Catalog now **162 patterns**, **66 detectors**. Go:
  156 empty `interface{}`, 157 ignored error (`val, _ :=`), 158 `fmt.Print` debug,
  159 `exec` `sh -c` injection. Rust: 160 `.unwrap()`/`.expect()`, 161
  `todo!`/`unimplemented!`/`panic!`, 162 `unsafe` block. `.rs` files are now scanned.
- **Language coverage — Python.** New Category 17 in the catalog (now **155 patterns**)
  with 5 automated Python detectors: 151 mutable default argument, 152 `== None`
  (should be `is None`), 153 `eval`/`exec` on input, 154 f-string SQL injection,
  155 `os.system`/`shell=True` command injection. Rule 078 now also catches Python's
  bare `except:`. **59 detectors** total. (Go and Rust follow.)

## [1.4.0]

### Added
- **`--watch` / `-w`** — re-scan on every file change (a live local conscience).
  Uses recursive `fs.watch` with a polling fallback; no new dependencies.
- **`--history [file]`** — record the Slop Score over time and print a trend
  sparkline ("`█▃▁  0 weighted · down 100% since last run`"). Commit
  `.slopscore-history.json` and watch the number move sprint over sprint.

- **Per-directory config** — `.slopscore.json` `"paths": { "legacy/": { "*": "minor" } }`
  applies rule overrides under a path (`"*"` targets every rule). Per-path wins over global.

### Changed
- **Cohesion-aware god-file (055).** A large file is only flagged when it's also
  *sprawling* (many top-level functions/classes); a 2,000-line registry, lookup
  table, or single cohesive class is no longer called slop.
- **Data-flow-lite for 071.** A constant string assignment (`innerHTML = "static"`,
  `__html: "..."`) and an `=== ` comparison no longer read as XSS — only dynamic
  injection does.

## [1.3.0]

### Added
- Detector **136** (hollow loading state — `if (loading) return null`, the white-flash
  tell of an unfinished UI) automated → 54 detectors. Broadened **142** to current
  aliased model ids (gpt-4o, claude-sonnet-4, gemini-1.5-pro, …).
- **Copy-paste / duplicate-block detector** (catalog 068, now automated → 53 detectors).
  Windowed normalized-block hashing finds code copy-pasted across files; overlapping
  windows merge into one finding; trivial lines (imports, braces) are excluded.
- `--sarif` — SARIF 2.1.0 output for GitHub code scanning (inline annotations on the PR diff).

### Changed
- Split the duplicate detector into `src/duplication.js` and deduped the finding
  constructor — slopscore flagged its own `scanner.js` as a god file, so we split it
  (the tool eats its own dog food).
- **Inline suppression** — `// slopscore-disable-next-line <id> — reason` (or `-line`).
  Bare form suppresses all rules on the line; the report shows the suppressed count.
- **Per-rule config** in `.slopscore.json` — `"rules": { "054": false, "099": "minor" }`
  disables a rule or overrides its severity.

## [1.2.0]

### Added
- **Baseline / ratchet mode** (`--baseline [file]`, `--update-baseline`). Snapshot
  the findings already in a codebase, then fail CI only on *new* slop — so a team
  with 500 existing findings can adopt the gate today and the count only goes down.
  Findings are keyed by content (not line number), so moving code is never "new."

### Changed
- The CI gate is now production-focused: findings in test/tooling are reported but
  don't fail the build (consistent with the context-weighted score).
- Reworded the zero-slop verdict from "Breathtaking" to **"Pristine. Ship it."**
  (verdict band, report messages, self-scan badge, and the protocol's quality bar).

- **[083] focus-ring is now cross-file aware.** A global `:focus-visible` reset
  defined anywhere in the project (CSS is global) suppresses `outline:none`
  findings repo-wide, instead of flagging every component that relies on it. Adds
  a general `unlessProject` rule mechanism backed by a cheap pre-pass over style files.

### Added
- **Context-aware scoring.** The headline Slop Score now reflects *production* risk:
  generated/vendored/minified files (`*.min.js`, huge single-line bundles, `@generated`)
  are skipped entirely, and findings in test/tooling/scripts are reported separately
  ("+ N in test / tooling — reported, not scored") instead of inflating the score.
  Each finding carries a `zone` (production | test), surfaced in `--json` and `--format agent`.
- Detector [012] (colored card left/top border) wired into the deterministic scanner — 52
  detectors now, and the catalog tag was added so detectors ↔ `⚙️ slopscore scan` tags stay 1:1.

## [1.1.0]

### Added
- `slopscore explain <id>` — print any one of the 150 catalog patterns and its fix from the
  CLI (e.g. `slopscore explain 058`), with an indicator of whether the scanner automates it.
- CI recipe for posting the Slop Score as a sticky PR comment, and a pre-commit hook recipe
  that scans only staged files.
- 40 tests (was 38), including CLI integration tests for `explain`.

### Changed
- Sharpened the 150-pattern catalog after a full editorial review: differentiated near-duplicate
  entries, corrected mis-rated severities/authorities (126/127/050), tightened unfalsifiable
  DETECTs (019/109), and reframed contested entries (140 now targets copy-pasted class strings,
  not idiomatic long Tailwind; 130 targets dead scaffolding). No detector or count change.

## [1.0.0]

### Added
- Zero-dependency CLI: `slopscore scan` with terminal, `--json`, `--markdown`, and `--format agent` reporters.
- 51 deterministic detectors mapped to the 150-pattern Anti-Slop Protocol.
- The Slop Score: severity-weighted findings, density per kLOC, and verdict bands.
- Comment-aware (string- and regex-literal-aware) matching, test-file skipping, and `.d.ts`
  exclusion to reduce false positives.
- Repo-level checks: committed `.env` (without shelling out to git), dependency bloat, thin
  README, versioned duplicate files.
- `slopscore protocol`, `slopscore rules`, and `slopscore init` (writes config + a GitHub Action PR gate).
- `ANTI_SLOP_PROTOCOL.md`: the full agent-facing operating manual.
- A keystone test that asserts slopscore passes its own scan, plus a self-scan CI gate.
- Ignore paths in `.slopscore.json` resolve against the config's directory, so a configured
  exclusion is honored no matter which sub-path you scan (`slopscore scan src` ≡ `slopscore scan .`).
- Read-only and subprocess-free; correct `--fail-on` gate; O(log n) line lookup (no DoS); no ReDoS.
