# Changelog

All notable changes to slopscore are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **`--watch` / `-w`** — re-scan on every file change (a live local conscience).
  Uses recursive `fs.watch` with a polling fallback; no new dependencies.
- **`--history [file]`** — record the Slop Score over time and print a trend
  sparkline ("`█▃▁  0 weighted · down 100% since last run`"). Commit
  `.slopscore-history.json` and watch the number move sprint over sprint.

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
