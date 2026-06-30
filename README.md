<div align="center">

# 🩺 slopscore

### Scan your codebase for AI slop. Get a Slop Score. Ship clean.

**A zero-dependency CLI + a 181-pattern protocol for AI coding agents.**
The antidote to vibe-coded software: turn *generation* into *governance*.

[![CI](https://github.com/Vinay-O/slopscore/actions/workflows/ci.yml/badge.svg)](https://github.com/Vinay-O/slopscore/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-339933)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![self-scan](https://img.shields.io/badge/slop%20score-0%20·%20pristine-brightgreen)](#it-passes-its-own-scan)

</div>

```bash
npx slopscore
```

That's it. No install, no config, no API key. Point it at a repo and it tells you — in one number — how much AI slop you're about to ship, and exactly how to fix each instance.

---

## The problem

In 2026, **46% of new code is AI-generated** and **92% of developers use AI tools daily** — but trust in that code fell from **77% to 60%**. GitClear's analysis of 211M lines found duplicated code up **4–8×**, refactoring collapsed **60%**, and AI PRs carry **~1.7× more issues**. Roughly **45% of AI-generated code ships a security weakness**.

<sub>Sources: GitHub / Stack Overflow 2025–26 developer surveys (adoption, trust); [GitClear, *AI Copilot Code Quality 2025*](https://www.gitclear.com/ai_assistant_code_quality_2025_research) (211M lines — duplication, refactoring decline); CodeRabbit (~1.7× more issues in AI PRs); [Veracode, *2025 GenAI Code Security Report*](https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/) (45% of tasks introduced a vulnerability, across 100+ models). Full attributions in [`ANTI_SLOP_PROTOCOL.md` §8](ANTI_SLOP_PROTOCOL.md).</sub>

The tools didn't create the problem. They revealed how little structure was there to begin with.

AI slop is insidious because it *looks* finished — consistent naming, passing tests, a polished purple hero section — while being architecturally hollow. You can't catch it by glancing at it. **slopscore catches it for you.**

## See it work

<!-- Render the GIF once with `vhs docs/demo.tape`, then embed it here: -->
<!-- ![slopscore scanning a sloppy file](docs/demo.gif) -->

```text
$ npx slopscore examples/slop.tsx

  slopscore  ·  1 files  ·  0.04 kLOC

  slop.tsx
    :5   🔴 CRIT   [058] Hardcoded secret / API key
         const API_KEY = "sk-proj-abc123def456ghi789jkl012mno345";
         fix: Move to an env var / secret manager. A committed secret is COMPROMISED — rotate it now.
    :15  🔴 CRIT   [072] SQL injection via template literal
         const q = `SELECT * FROM users WHERE id = ${data.id}`;
         fix: Use parameterized queries / prepared statements. Never interpolate input into SQL.
    :17  🔴 CRIT   [053] Empty catch block (silent error swallowing)
         } catch (e) {}
         fix: At minimum log with context; better, handle or rethrow and surface a real message.
    :10  🟠 MAJOR  [070] Hallucinated API method
         const data: any = fetch.get("http://localhost:3000/api/users");
         fix: Use the real API: fetch(url,{method}); .then()/await. These methods do not exist.
    :24  🟠 MAJOR  [041] AI buzzword copy
         <Sparkles /> Supercharge your workflow, effortlessly!
         fix: Replace with a concrete, specific claim: what it does, for whom, and the real outcome.
    …

  ╔══════════════════════════════════════════╗
  ║             S L O P   S C O R E              ║
  ╚══════════════════════════════════════════╝

   88 weighted   (35 lines scanned)
   5 critical   10 major   8 minor
   by rule: 069 ×2 · 105 ×1 · 058 ×1 · 054 ×1 · 070 ×1 · 099 ×1

   ▶ Vibe-coded. Audit before anyone depends on it.
```

Every finding has a **severity**, a **catalog ID**, the **exact location**, and a **fix**. No vague "code smells" — a punch list you can act on.

## Quick start

```bash
npx slopscore                      # scan the current directory
npx slopscore scan src --fail-on minor
npx slopscore examples/slop.tsx    # watch a sloppy file score 88
npx slopscore . --markdown > slop.md
```

Or install it:

```bash
npm i -g slopscore && slopscore
```

## Two ways to use it

slopscore ships **two halves of the same idea**: a deterministic scanner you run, and a protocol you hand to an AI.

### 1. The scanner (deterministic, zero-dependency)

Runs **85 detectors** locally in milliseconds — a hardened **security pass** (secrets, SQL/command injection, disabled TLS verification, weak hashing, insecure randomness, hardcoded private keys, insecure deserialization, wildcard CORS, `eval`, unverified JWTs, cleartext HTTP), plus empty catches, `any`, hallucinated APIs, missing `alt`, the VibeCode-purple gradient, AI buzzword copy, and god files. No LLM, no network, no dependencies.

Run a focused security audit with `slopscore scan . --category security`.

### 2. The protocol (for your coding agent)

[`ANTI_SLOP_PROTOCOL.md`](ANTI_SLOP_PROTOCOL.md) is a **181-pattern operating manual** for AI agents. Hand it to Claude Code, Cursor, Codex CLI, Aider, Copilot, Windsurf, or Cline and say:

> **"Check the system."**

The agent runs a defined loop — orient → scan → score → triage → **fix** → verify → report — where every pattern carries a `DETECT`, a `FIX`, and a **fix authority** (🟢 auto-fix · 🟡 propose · 🔴 flag-for-human) so it knows what it may change on its own versus what needs your call. The **85 patterns the CLI already automates are tagged `⚙️ slopscore scan`** right in the catalog (generated from the scanner's own rule table, so the two halves never drift) — the untagged ones are where the agent earns its keep.

```bash
slopscore protocol | pbcopy        # copy the protocol to paste into your agent
slopscore scan . --format agent    # compact, context-window-friendly output for an agent
slopscore explain 058              # look up any one pattern + its fix, by id
```

**Make agents use it automatically.** You shouldn't have to remind your agent every session. `slopscore init` writes an **`AGENTS.md`** (the cross-tool standard that Cursor, Codex, Claude Code, Aider, Windsurf, and Cline all read) that tells the agent to load `npx slopscore protocol`, follow it, and gate on `npx slopscore scan` before declaring done — so the protocol is adopted on its own, no copy-paste required. If you already have an `AGENTS.md` or `CLAUDE.md`, it appends the section (idempotently) instead of overwriting.

The scanner finds it. The protocol fixes it. The CI gate keeps it out. And `AGENTS.md` makes your agent do all three without being asked.

## The Slop Score

One number, weighted by severity, normalized per 1,000 lines so big repos don't look worse just for being big:

```
SLOP SCORE   = (🔴 critical × 10) + (🟠 major × 3) + (🟡 minor × 1)
SLOP DENSITY = weighted findings per 1,000 lines (kLOC)
```

| Density (weighted / kLOC) | Verdict |
|:--|:--|
| 0 | **Pristine. Ship it.** |
| ≤ 2 | Clean. Human-grade. |
| 2–6 | Mild slop. A focused pass fixes it. |
| 6–12 | Heavy slop. Needs real work. |
| > 12 | Vibe-coded. Audit before anyone depends on it. |

> Field benchmark: established codebases run ~4.4 weighted findings/kLOC; vibe-coded ones run ~14 — over 3× higher.

### The score reflects *production* risk

A `console.log` in a test runner is not a SQL injection in production — so they shouldn't score the same. slopscore is context-aware by default:

- **Generated and vendored files are skipped** — minified bundles (`*.min.js`), files with enormous single lines, and `@generated` headers are not your code, so they don't pollute the score.
- **Test and tooling code is reported, not scored** — findings in `test/`, `e2e/`, `scripts/`, `__tests__/`, `*.spec.*`, etc. still surface, but they don't inflate the headline Slop Score (`5 critical … (production) · + 12 in test / tooling — reported, not scored`).

The number you see is the risk you're actually shipping.

## It passes its own scan

A linter about not shipping slop had better not *be* slop. So slopscore holds itself to its own standard:

- **Zero runtime dependencies.** The whole tool is Node built-ins.
- **`slopscore scan .` on this repo returns `0` — "Pristine."**
- Its own CI runs the scanner on its own source at `--fail-on minor` and fails the build if anything slips.

```bash
npm run selfcheck     # → Pristine. Ship it.  (exit 0)
```

*(The rule-definition file and example fixtures are excluded — they necessarily contain the very strings slopscore looks for, exactly as ESLint excludes its own fixtures. See [`.slopscoreignore.md`](.slopscoreignore.md).)*

## Drop it into CI

```bash
slopscore init     # writes .slopscore.json + a GitHub Action PR gate
```

Or paste this:

```yaml
# .github/workflows/anti-slop.yml
name: anti-slop
on: [pull_request]
jobs:
  slopscore:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx slopscore scan . --fail-on major
```

**Want findings inline on the PR diff?** Emit SARIF and upload it to GitHub code scanning:

```yaml
      - run: npx slopscore scan . --sarif --fail-on never > slopscore.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: slopscore.sarif }
```

**Want the Slop Score posted on every PR?** Add a sticky comment from the Markdown report:

```yaml
      - run: npx slopscore scan . --markdown > slop.md || true
      - uses: marocchino/sticky-pull-request-comment@v2
        with: { path: slop.md }
```

**Pre-commit hook** (catches slop before it's even committed — scans only what you staged):

```bash
# .git/hooks/pre-commit  (chmod +x it)
files=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$files" ] || npx slopscore $files --fail-on major
```

### Adopting it on a messy codebase — ratchet mode

A real repo won't score 0 on day one, and "Heavy slop" on your first run is how a tool gets closed and forgotten. So **baseline what's already there and fail only on _new_ slop:**

```bash
slopscore scan . --baseline        # first run: snapshots current findings, exits 0
slopscore scan . --baseline        # from now on: passes unless you ADD slop
slopscore scan . --update-baseline # accept the current state as the new floor
```

The baseline keys findings by content, not line number — so moving code around never registers as new slop. Commit `.slopscore-baseline.json` and your CI gate goes green today while the count only ever goes down.

## Auto-fix the safe stuff

Some slop has exactly one correct fix and no judgment call — a stray `console.log`, an `<img>` missing `alt`, Python's `== None`. `slopscore fix` applies those (and only those) for you:

```bash
slopscore fix . --dry-run      # preview every change, write nothing
slopscore fix .                # apply them, then review the diff
slopscore fix . --only 052     # just the console.logs
slopscore fix . --except 069   # everything fixable except comment removal
```

It only ever touches the 🟢 **AUTO**-authority rules with a deterministic, behavior-preserving transform (today: `052` console.log, `069` step-narration comments, `081` `<img>` alt, `152` Python `== None`, `158` Go `fmt.Print` debug). It is conservative by design — a multi-line `console.log`, a trailing comment, or anything that needs a name or a destination is left for you. Everything else stays a propose/flag you review by hand.

## Local development

```bash
slopscore scan . --watch       # re-scan on every save — a live conscience
slopscore scan . --history     # record the score over time + a trend sparkline
slopscore scan . --sarif       # inline annotations on the PR diff (code scanning)
slopscore scan . --markdown --out slop.md   # write a UTF-8 report file directly
```

`--history` writes `.slopscore-history.json` and prints `trend  █▃▁  0 weighted · down 100% since last run` — commit it and watch slop fall sprint over sprint.

**Windows / legacy terminals.** slopscore auto-detects consoles that can't render Unicode (legacy `cmd`/PowerShell on a non-UTF-8 code page) and falls back to ASCII glyphs — force it either way with `--ascii` / `--unicode`. Prefer `--out <file>` over a `>` redirect: it writes UTF-8 straight from Node, so the report never comes out as mojibake or UTF-16.

**Confidence.** Every finding carries a confidence (high / medium / low) separate from severity — precise detectors like secrets and SQL injection are high; design/copy idioms and the duplicate-block heuristic are softer. Gate CI on the strong signal with `--min-confidence high`, or just read the inline `~medium confidence` tag. Dead `slopscore-disable` directives (the finding they hid is gone) are flagged as **stale** so they don't accumulate.

## Configuration

`.slopscore.json` in your repo root:

```json
{
  "ignore": ["examples", "legacy", "src/generated"],
  "failOn": "major",
  "rules": {
    "054": false,
    "099": "minor"
  },
  "paths": {
    "legacy/": { "*": "minor" }
  }
}
```

| Option | Meaning |
|:--|:--|
| `ignore` | Extra paths to skip (added to the built-in `node_modules`, `dist`, etc.) |
| `failOn` | Exit non-zero at `critical`, `major`, `minor`, or `never` |
| `rules` | Per-rule overrides — `false`/`"off"` disables a rule; `"critical"`/`"major"`/`"minor"` overrides its severity |
| `paths` | Per-directory overrides — same shape as `rules`, plus `"*"` to target every rule under a path (e.g. soften all of `legacy/`) |

**Suppress one finding inline** with a directive (require a reason for your future self):

```ts
// slopscore-disable-next-line 054 — deliberate cast at the Deno JSON boundary
const config = data as any;
```

A bare `// slopscore-disable-next-line` (no id) suppresses every rule on the next line; `slopscore-disable-line <id>` works on the same line. The terminal report prints how many findings were suppressed, so they don't rot.

## What it detects (85 of the 181)

The CLI runs the deterministic subset; the [full 181-pattern catalog](ANTI_SLOP_PROTOCOL.md) (including visual, architectural, and judgment-heavy patterns) is what you hand your agent.

| Category | Examples |
|:--|:--|
| 🔐 Security | Hardcoded secrets (incl. AWS keys, GitHub PATs, private keys) · SQL injection · command injection via interpolated shell · auth tokens in `localStorage` · secrets in URL query params · `dangerouslySetInnerHTML` · stack traces to client · committed `.env` · placeholder config values |
| 🧱 Code quality | Empty catch blocks · overly-broad exceptions (`except Exception`, `catch (e: any)`) · `any` everywhere · double assertions · hallucinated APIs · god files · TODO/FIXME · `setTimeout` race "fixes" · tautological test assertions |
| 📦 Supply chain | Dependency bloat · unpinned/aliased LLM model strings · source maps shipped to production · whole-library imports for one utility |
| ♿ Accessibility | `<img>` without alt · interactive `<div onClick>` · `outline:none` with no focus style |
| 🎨 Visual slop | VibeCode-purple gradient · conic/mesh gradients · glassmorphism · gradient-clip text · Sparkle/Wand icons · recycled AI fonts · confetti |
| ✍️ Copy | AI buzzwords ("supercharge", "seamlessly") · exclamation-mark CTAs · "Coming soon" · "Oops!" errors · "Submit" buttons · "Click here" links · lorem ipsum |
| 🏗️ Architecture / API | Hardcoded localhost · `window.location` nav in SPAs · `location.reload()` recovery · errors returned as HTTP 200 · destructive GET · `z-index: 9999` · `alert()`/`confirm()` |

Run `slopscore rules` to see the full list with severities and fix authority.

## How it compares

| | slopscore | ESLint | vibecop | Semgrep |
|:--|:--:|:--:|:--:|:--:|
| AI-slop-specific patterns | ✅ | ❌ | ✅ | ⚠️ |
| Visual / design / copy tells | ✅ | ❌ | ❌ | ❌ |
| Slop Score (one number) | ✅ | ❌ | ❌ | ❌ |
| Agent-ready protocol (fix authority) | ✅ | ❌ | ❌ | ❌ |
| Zero install (`npx`, no config) | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Zero dependencies | ✅ | ❌ | ❌ | ❌ |

This table is scoped to **AI-slop detection specifically** — it is not a quality ranking. ESLint and Semgrep are excellent at what they're built for (correctness rules, taint analysis), and slopscore is no substitute for either; the `❌`s just mean "not designed to catch the AI tells slopscore targets." slopscore is intentionally a **fast, transparent, zero-dependency first pass** — regex/heuristic detection, not deep dataflow. For AST-level analysis (real cyclomatic complexity, cross-file duplication, taint tracking) **run it alongside** [vibecop](https://github.com/bhvbhushan/vibecop), Semgrep, or CodeQL — the protocol ([`ANTI_SLOP_PROTOCOL.md`](ANTI_SLOP_PROTOCOL.md)) tells your agent exactly when to reach for those. It complements your linter; it doesn't replace it.

## FAQ

**Is regex enough to catch all AI slop?** No, and slopscore never claims it is. It nails the deterministically-detectable subset fast and with low false positives, then defers the judgment-heavy and AST-level patterns to the protocol + dedicated tools. Honesty over theater.

**Will it touch my code?** The CLI only *reports*. Fixing is done by you, or by your AI agent following the protocol's fix-authority rules.

**False positives?** The scanner is comment-aware (it won't flag `console.log` inside a comment), skips test files where appropriate, and excludes type-definition shims. Tune further via `.slopscore.json`. Found a bad one? [Open an issue.](../../issues)

**Does it work for Python / Go / etc.?** Security and copy detectors run on all source; many patterns are JS/TS-shaped because that's where vibe-coded slop concentrates. The protocol is language-agnostic by design.

## Contributing

Adding a detector is one object in [`src/rules.js`](src/rules.js) + a test. See [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are labeled `good first issue`.

```bash
git clone https://github.com/Vinay-O/slopscore && cd slopscore
npm test          # 40 tests, zero dependencies
npm run demo      # scan the sloppy fixture
npm run selfcheck # prove the repo passes its own audit
```

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, build it into your pipeline.

---

<div align="center">

**If slopscore saved you from shipping slop, drop a ⭐ — it helps the next person find it.**

*From generation to governance.*

</div>
