# Changelog

All notable changes to slopscore are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
