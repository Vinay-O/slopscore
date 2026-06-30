# Changelog

All notable changes to slopscore are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
