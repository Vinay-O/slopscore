# Changelog

All notable changes to slopscore are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
