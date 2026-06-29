# Changelog

All notable changes to slopscore are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [1.0.0]

### Added
- Zero-dependency CLI: `slopscore scan` with terminal, `--json`, `--markdown`, and `--format agent` reporters.
- 51 deterministic detectors mapped to the 150-pattern Anti-Slop Protocol.
- The Slop Score: severity-weighted findings, density per kLOC, and verdict bands.
- Comment-aware matching, test-file skipping, and `.d.ts` exclusion to reduce false positives.
- Repo-level checks: committed `.env`, dependency bloat, thin README, versioned duplicate files.
- `slopscore protocol`, `slopscore rules`, and `slopscore init` (writes config + a GitHub Action PR gate).
- `ANTI_SLOP_PROTOCOL.md`: the full agent-facing operating manual.
- 38 tests (Node's built-in runner), including a keystone test that asserts slopscore
  passes its own scan, plus a self-scan CI gate that proves the repo holds its own standard.
- Ignore paths in `.slopscore.json` resolve against the config's directory, so a configured
  exclusion is honored no matter which sub-path you scan (`slopscore scan src` ≡ `slopscore scan .`).
