# THE ANTI-SLOP PROTOCOL
### A single-file operating manual that turns any AI coding agent into a system auditor and surgeon

> **Invocation.** Drop this file into your repo (e.g. `ANTI_SLOP_PROTOCOL.md`, or paste it into your
> agent's system prompt / `CLAUDE.md` / `.cursorrules`) and say:
>
> > **"Check the system."**
>
> The agent then runs the loop in §0, scans against the catalog in §3, scores the result, fixes
> what it is authorized to fix, and hands you a report. "Make it pristine" = run the loop until
> the Slop Score is 0 and the three Escape Moves in §5 are satisfied.

> **What this is.** Every reliable signature of AI-generated slop — visual, typographic, structural,
> code-level, security, and supply-chain — distilled into machine-checkable rules. Each entry carries
> a `DETECT` pattern (grep/AST/heuristic) **and** a `FIX` (what to do about it) **and** a `FIX AUTHORITY`
> (whether the agent may fix it silently, must propose it, or may only flag it).
>
> **Why this exists (2026 reality).** 46% of all new code is now AI-generated and 92% of US developers
> use AI tools daily, but developer trust in that code has fallen from 77% to 60%. GitClear's analysis
> of 211M lines of code found duplicated blocks grew 4–8×, refactoring (moved lines) collapsed from
> ~25% of changes in 2021 to under 10% by 2024 — the first year copy/paste exceeded refactoring — and
> short-term churn rose from 5.5% to 7.9%. CodeRabbit measured ~1.7× more issues in AI PRs. Roughly
> 45% of AI-generated code contains a security weakness, and Georgia Tech's Vibe Security Radar logged
> dozens of CVEs traceable to AI coding tools in a single month of 2026. The tool didn't create the
> problem; it revealed how little structure was there to begin with. This file is the structure.

---

## §0 · AGENT DIRECTIVE — READ THIS FIRST

You are operating as a **system auditor and surgeon**. When the human says *"check the system,"*
*"audit this,"* *"de-slop this,"* or anything equivalent, execute the following loop **in order**.
Do not skip phases. Do not start editing before you have scanned and scored.

### The Loop

```
ORIENT → INVENTORY → SCAN → SCORE → TRIAGE → FIX → VERIFY → REPORT → (repeat until clean)
```

**1 · ORIENT.** Read what the project actually *is* before judging it. Open `package.json` /
`pyproject.toml` / `go.mod`, the README, the framework config, and the directory tree. Identify:
language(s), framework(s), whether it ships UI, whether it has a backend/db, and the intended
audience. A pattern that is slop in a production SaaS may be fine in a throwaway prototype — context
sets the bar. State the context in one sentence before proceeding.

**2 · INVENTORY.** List the surface area you will scan: source dirs, config, CI, the dependency
manifest, and any design tokens. Note what you will *not* touch (vendored code, generated files,
`node_modules`, lockfiles unless fixing a supply-chain finding, anything in `.gitignore`).

**3 · SCAN.** Run the scanner in §2 (tools + the master script) and walk the catalog in §3. For each
finding record: pattern ID, file:line, severity, and fix authority. Prefer AST tools (`vibecop`,
`semgrep`, `ast-grep`) over raw grep where available — grep is the fallback, not the goal. **Read the
code around each hit before believing it.** A `console.log` in a logger utility is not a finding; a
`: any` in a `.d.ts` shim may be unavoidable. Suppress false positives explicitly and say why.

**4 · SCORE.** Compute the Slop Score (below). This is the single number you report and drive to zero.

**5 · TRIAGE.** Sort findings by severity, then by blast radius. Fix the things that break or endanger
users first (🔴), then the things that rot maintainability (🟠), then the aesthetic tells (🟡). Never
let a 🟡 cosmetic edit risk a 🔴 regression.

**6 · FIX.** Apply fixes **according to the authority level on each pattern** (see below). Work on a
branch. Make one atomic commit per pattern class with a message naming the pattern ID. After each
fix, the code must still build and tests must still pass — if a fix breaks the build, revert it and
downgrade to PROPOSE.

**7 · VERIFY.** Re-run the scan. Confirm the finding is gone and nothing regressed (build, typecheck,
tests, and — for UI — that the page still renders and contrast still passes). A fix that trades one
slop pattern for another (e.g. replacing a god component with three god components) does not count.

**8 · REPORT.** Emit the report in §4: before/after Slop Score, what you fixed, what you propose, what
you flagged for human decision, and the diff summary. Then offer to run the loop again.

### Fix Authority — what you may change without asking

Every catalog entry is tagged with one of these. **Obey it.**

| Tag | Meaning | Examples |
|-----|---------|----------|
| **🟢 AUTO** | Mechanical, reversible, no taste required. Fix it silently and report it. | remove `console.log`, add `alt=""`, sentence-case a SHOUTING button, delete unused imports, add `aria-label`, replace `Submit` with a real verb, parameterize a SQL query |
| **🟡 PROPOSE** | Requires design or architectural judgment, or is large. Fix it **on the branch**, show the diff, and let the human accept or revert. Never silently impose taste. | recolor the purple gradient, restructure a centered-everything layout, split a god component, choose a non-Inter typeface, replace fake stats with real bindings |
| **🔴 FLAG** | Needs context, a human decision, or an out-of-band action you cannot safely take. Report it precisely; do **not** change it. | rotate a leaked secret (you can move it to env, but you must tell the human to revoke + rotate), delete a "Coming soon" that may be a real roadmap promise, remove a feature whose "fakeness" might be intentional staging |

**Three rules that override everything:**
1. **Do no harm.** If you are not sure a change is safe, downgrade its authority one level (AUTO→PROPOSE→FLAG).
2. **Working code is sacred.** A slop tell in code that works is lower priority than any change that risks breaking it. Aesthetics never justify a regression.
3. **Don't trade slop for slop.** The goal is fewer patterns *and* a coherent system, not a different set of defaults. If your fix would itself trip a catalog entry, rethink it.

### The Slop Score

For the scanned surface, count findings and weight by severity:

```
SLOP SCORE  =  (🔴 critical × 10)  +  (🟠 major × 3)  +  (🟡 minor × 1)
```

Then report the **density** alongside the raw score, because big repos have more of everything:

```
SLOP DENSITY  =  weighted findings per 1,000 lines of code (kLOC)
```

Benchmark from vibecop's field scans: established codebases run ~4.4 findings/kLOC; vibe-coded ones
run ~14.0/kLOC (3.2× higher). Targets:

| Density (weighted / kLOC) | Verdict |
|---|---|
| 0 | Pristine. Ship it. |
| ≤ 2 | Clean. Human-grade. |
| 2–6 | Mild slop. A focused pass fixes it. |
| 6–12 | Heavy slop. Needs real work. |
| > 12 | Vibe-coded. Audit before anyone depends on it. |

A system is **"pristine"** (the bar the human is asking for) when: Slop Score = 0 on 🔴 and 🟠,
remaining 🟡 are deliberate and defensible, **and** all three Escape Moves in §5 are satisfied.

### When to stop and ask the human

Pause the loop and ask when: a fix would change product behavior or copy meaning; a "fake feature" might
be intentional staging; removing something could delete real work; a secret needs rotation; the
framework or design system is itself the thing being questioned; or the fix list exceeds what one review
can absorb (offer to batch it). Otherwise, keep going — an unnecessary question costs the human more
than an unnecessary AUTO fix.

---

## §1 · THE LANDSCAPE — what you are hunting and why

Slop is not "ugly." Slop is **the absence of decision**: the statistically-average output a model
emits when no one supplied taste or constraints. It is dangerous precisely because it *looks* finished
— consistent naming, passing tests, a polished hero section — while being architecturally hollow.

Three layers, each covered by this catalog:

- **Visual slop** (Categories 1–6) is the canary. If the UI looks like every other chat-generated
  page — purple gradient, Inter, sparkles, three icon cards, badge-above-hero — the code underneath
  almost always shares the same defaultness. Adrian Krebs scored 1,590 Show HN pages against 16 DOM/CSS
  tells: 22% were heavy slop (4+ tells), 32% mild (2–3), 46% clean. More than half carry a visual
  fingerprint that says "generated by a chat interface without an opinion."

- **Code slop** (Categories 7–12) is the rot. God functions, `any` everywhere, empty catch blocks,
  duplicated blocks instead of abstractions, tests that mirror implementation instead of asserting
  behavior. It compiles. It passes. It cannot be reasoned about, and it churns 1.7–9× more than
  hand-written code.

- **Security & supply-chain slop** (Categories 13–16) is the landmine. Hardcoded secrets, SQL injection
  via template literals, auth tokens in `localStorage`, fake features that silently do nothing,
  unpinned model strings, and **hallucinated dependencies** that attackers pre-register
  ("slopsquatting"). ~45% of AI-generated code carries a weakness here.

Your job is to find all three layers, fix what you may, and leave the system more coherent than you
found it.

---

## §2 · THE SCANNER

### 2.1 · Prefer real analyzers over grep

Grep finds strings; AST tools understand structure (they won't flag `console.log` inside a comment or
a string, and they can measure real cyclomatic complexity). Reach for these first; fall back to the
master grep script (2.3) only when they're unavailable.

| Tool | What it catches | Invoke |
|------|-----------------|--------|
| **vibecop** | 35 deterministic AST detectors built for AI code: god functions/components, N+1 queries, unbounded queries, debug logs, dead code, double assertions, excessive `any`, TODO-in-prod, empty catches, SQLi via template literals, `dangerouslySetInnerHTML`, tokens in `localStorage`, placeholder config, `eval`/hardcoded creds, mixed concerns, trivial assertions, over-mocking, **unpinned LLM model strings**, **hallucinated/low-reputation packages**, unsafe shell exec. Zero LLM, fast, local. JS/TS + Python. | `npx vibecop scan .` — or `vibecop init` to install always-on hooks for Claude Code, Cursor, Codex CLI, Aider, Copilot, Windsurf, Cline. Use `--format agent` to compress findings to ~30 tokens each when running inside an agent. |
| **semgrep** | Code-level vulns (injection, XSS, path traversal) via rules. | `semgrep --config auto .` |
| **CodeQL** | Deep dataflow/taint analysis. | via GitHub code scanning |
| **gitleaks / trufflehog** | Hardcoded secrets, committed `.env`, tokens in history. | `gitleaks detect --source .` |
| **npm audit / pip-audit / Snyk / osv-scanner** | Known CVEs in dependencies. | `npm audit` · `pip-audit` · `osv-scanner -r .` |
| **eslint / ruff / tsc --noEmit** | Unused imports, missing deps arrays, type holes. | `eslint . && tsc --noEmit` |
| **axe-core / Lighthouse / pa11y** | Contrast, labels, focus order, alt text (Cat 8). | `pa11y <url>` · Lighthouse a11y audit |
| **knip / depcheck / ts-prune** | Unused deps, dead exports, duplicate packages. | `npx knip` |
| **madge** | Circular dependencies. | `npx madge --circular src/` |

> **Supply-chain note (read before you `npm install` anything):** AI agents hallucinate package names
> at measurable rates (open-source models ~21.7%, commercial ~5.2% in 2025 studies), and the
> hallucinations *recur* — 43% of fabricated names reappear across identical re-prompts — which is
> exactly what makes them squattable. Before adding any dependency an AI suggested, **verify it exists,
> check its download count and publish date, and confirm it is the package you mean** (e.g.
> `eslint-plugin-unused-imports`, not the malicious `unused-imports`). Never let an agent install
> packages without an allowlist gate or human review. Pin versions and verify lockfile hashes.

### 2.2 · A note on language coverage

The catalog's `DETECT` blocks lean JS/TS/React because that is where vibe-coded slop concentrates, but
the *patterns* are language-agnostic. Translate as you go: `console.log`→`print`/`fmt.Println`,
`: any`→`interface{}`/`Any`, `try{}catch(e){}`→`except: pass`, god component→god module, etc. When you
scan a non-JS repo, apply the spirit of each rule, not just its regex.

### 2.3 · The master scan script (grep fallback)

Run from project root. This is intentionally noisy — every hit is a *candidate*, not a verdict. Read
the surrounding code before recording a finding. Adjust `SRC` and the include globs for your stack.

```bash
#!/usr/bin/env bash
# anti-slop-scan.sh — fast first-pass triage. Pipe to a file and review every hit.
set -uo pipefail
SRC="${1:-.}"
TS='--include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.vue --include=*.svelte'
CSS='--include=*.css --include=*.scss --include=*.tsx --include=*.jsx'
NOTEST='-Ev "(\.test\.|\.spec\.|__tests__|\.stories\.|node_modules|/dist/|/build/)"'

scan () { echo; echo "### $1"; shift; eval "grep -rnI $* \"$SRC\" 2>/dev/null | $NOTEST" || echo "  (none)"; }

echo "======== ANTI-SLOP SCAN: $(date) ========"

# --- VISUAL ---
scan "001 VibeCode-purple gradient"      "$CSS" -e 'from-purple.*to-indigo' -e 'from-violet.*to-blue' -e '#7c3aed|#4f46e5|#6d28d9'
scan "002 Sparkle / Wand AI icons"       "$TS"  -e 'Sparkles?\b' -e 'Wand2?\b' -e '✨'
scan "003 Glassmorphism"                 "$CSS" -e 'backdrop-filter.*blur' -e 'backdrop-blur-' -e 'WebkitBackdropFilter'
scan "004 Aurora/mesh/radial bg"         "$CSS" -e 'radial-gradient' -e 'conic-gradient' -e 'aurora|mesh-gradient'
scan "007 Decorative glow shadows"       "$CSS" -e 'box-shadow.*rgba.*0\.[3-9]' -e 'shadow-(purple|blue|glow)' -e 'drop-shadow.*(purple|indigo)'
scan "008 Gradient clip text"            "$CSS" -e 'background-clip: ?text' -e '-webkit-background-clip' -e 'bg-clip-text text-transparent'
scan "012 Colored left/top card border"  "$TS"  -e 'border-[lt]-[24] border-(purple|indigo|blue|red|green)'
scan "017 Emoji nav icons"               "$TS"  -e '🏠|⚙️|📊|👤|🔔|💡|🚀'
scan "018/024 ALL-CAPS labels/buttons"   "$CSS" -e 'uppercase' -e 'text-transform: ?uppercase'
scan "020 Confetti/particles"            "$TS"  -e 'canvas-confetti|react-confetti|tsparticles'
scan "027 rounded-full on containers"    "$TS"  -e 'rounded-full' -e 'border-radius: ?9999'

# --- TYPOGRAPHY ---
scan "021 Inter as sole font"            "$CSS" -e "font-family.*'Inter'" -e 'Inter'
scan "022 Recycled font combos"          "$CSS" -e 'Space\+?Grotesk|Instrument\+?Serif|Geist|Syne|Plus\+?Jakarta'

# --- COPY ---
scan "041 AI buzzword copy"              "$TS"  -ie 'supercharge|harness the power|unlock your|revolutionize|seamlessly|effortlessly|cutting-edge|next-generation|game-changing'
scan "042 Lorem ipsum"                   "$TS"  -ie 'lorem ipsum|dolor sit amet'
scan "043 Coming soon / WIP"             "$TS"  -ie 'coming soon|under construction|work in progress|🚧'
scan "044 Oops error messages"           "$TS"  -ie 'oops|uh oh|whoops|something went wrong'
scan "045 Exclamation CTAs"              "$TS"  -e '>(Get Started|Sign Up|Try (it|Now)|Learn More)[^<]*!'
scan "046 Submit button"                 "$TS"  -e '>Submit<' -e 'value="Submit"'
scan "047 Click here links"              "$TS"  -ie '>click here<|>tap here<|>here</a>'

# --- CODE QUALITY ---
scan "051/069 Step-narration comments"   "$TS"  -e '// Step [0-9]' -e '// Phase [0-9]' -e '# Step [0-9]'
scan "052 console.log in prod"           "$TS"  -e 'console\.(log|dir|table|debug)\('
scan "053 Empty catch blocks"            "$TS"  -Pzo 'catch\s*\([^)]*\)\s*\{\s*\}'
scan "054 TypeScript any"                "$TS"  -e ': any\b' -e 'as any\b' -e 'Record<string, ?any>' -e '\[key: ?string\]: ?any'
scan "057 TODO/FIXME/HACK"               "$TS"  -e '(TODO|FIXME|HACK|XXX):'
scan "058 Hardcoded secrets"             "$TS"  -Ee 'API_KEY\s*=\s*["'\''][A-Za-z0-9_\-]{16,}' -e 'sk-[A-Za-z0-9]{20,}' -e 'Bearer [A-Za-z0-9._\-]{20,}'
scan "061 Versioned dup files"           "$TS"  -l -e '' # see note: use `find` below
scan "065 setTimeout race fixes"         "$TS"  -e 'setTimeout\([^,]*,\s*[1-9][0-9]{2,}\)'
scan "070 Hallucinated JS methods"       "$TS"  -e 'fetch\.(get|post)\(' -e '\.flatten\(' -e '\.capitalize\(' -e 'promise\.done\('
scan "071 dangerouslySetInnerHTML"       "$TS"  -e 'dangerouslySetInnerHTML' -e '\.innerHTML\s*='
scan "072 SQLi via template literals"    "$TS"  -e '`(SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{'
scan "073 Tokens in localStorage"        "$TS"  -e 'localStorage\.(set|get)Item\([^)]*(token|jwt|auth|secret)'
scan "076 Placeholder config"            "$TS"  -e 'YOUR_API_KEY|REPLACE_ME|INSERT_YOUR|example@email\.com|test123'
scan "077 Double assertions"             "$TS"  -e 'as unknown as' -e 'as any as'

# --- A11Y ---
scan "081 img without alt"               "$TS"  -Pzo '<img(?:(?!alt=)[^>])*?>'
scan "082 div/span onClick"              "$TS"  -e '<(div|span)[^>]*onClick'
scan "083 outline:none w/o focus-visible" "$CSS" -e 'outline: ?(none|0)' -e 'outline-none'

# --- ARCH / API / SECURITY ---
scan "099 Hardcoded localhost"           "$TS"  -e 'http://localhost' -e '127\.0\.0\.1' -e ':(3000|8000|8080)\b'
scan "103 z-index 9999"                  "$CSS" -e 'z-index: ?9{3,}' -e 'z-\[9{3,}\]'
scan "104 !important abuse"              "$CSS" -e '!important'
scan "105 location.reload as recovery"   "$TS"  -e 'location\.reload\('
scan "106 alert/confirm/prompt"          "$TS"  -e '\b(alert|confirm|prompt)\('
scan "111 Destructive GET"               "$TS"  -e '\.get\(["'\''][^"'\'']*(delete|remove|destroy|purge)'
scan "116 Errors as HTTP 200"            "$TS"  -e 'status\(200\)[^;]*error'
scan "134 Stack trace to client"         "$TS"  -e 'error\.stack' -e 'err\.stack'
scan "139 window.location nav in SPA"    "$TS"  -e 'window\.location\.(href|replace)'
scan "NEW source maps in prod"           "$CSS" -e 'sourceMap: ?true' -e 'productionBrowserSourceMaps: ?true'

echo
echo "### 061 Duplicate/versioned files"
find "$SRC" -type f \( -name '*_v[0-9]*' -o -name '*_old.*' -o -name '*_backup.*' -o -name '*_copy.*' -o -name '*_final.*' -o -name '* 2.*' \) 2>/dev/null | grep -Ev 'node_modules|/dist/' || echo "  (none)"

echo
echo "### Big files (god component/function candidates, 053/055/135)"
find "$SRC" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.py' \) 2>/dev/null \
  | grep -Ev 'node_modules|/dist/|\.test\.|\.spec\.' \
  | xargs wc -l 2>/dev/null | awk '$1 > 400 {print}' | sort -rn || echo "  (none)"

echo
echo "### .env committed? (107)"
git ls-files 2>/dev/null | grep -E '^\.env' && echo "  ⚠️  .env IS TRACKED — CRITICAL" || echo "  ok (no tracked .env)"

echo "======== SCAN COMPLETE — every hit is a candidate, not a verdict ========"
```

> After the grep pass, run the AST tools in 2.1 for the structural patterns grep can't measure (god
> functions by complexity, N+1 by dataflow, duplication across files). Then walk the catalog in §3 for
> everything that needs human reading (layout sameness, fake features, architectural drift).

---

## §3 · THE CATALOG

Each entry: **ID · Title** `SEVERITY` `AUTHORITY` — description, `DETECT` (how to find it), `FIX`
(what to do). Severity: 🔴 critical (breaks/endangers) · 🟠 major (rots maintainability/UX) · 🟡 minor
(aesthetic tell). Authority: 🟢 AUTO · 🟡 PROPOSE · 🔴 FLAG (see §0).

A `` `⚙️ slopscore scan` `` tag means **the deterministic CLI already detects this pattern** —
`npx slopscore` flags it for you with the exact location and fix. **66 of the 162** carry this tag
today; the rest need an AST tool (§2.1) or human reading (layout sameness, fake features,
architectural drift). The tags are generated from the scanner's own rule table, so they never
drift from what the CLI actually does. Patterns *without* the tag are where you, the agent, earn
your keep.

---

### CATEGORY 1 — Visual Signatures (the instant eye-test fails)

The tells a designer clocks in three seconds. In Krebs' audit, 54% of pages tripped 2+ of these.

**001 · "VibeCode Purple" gradient hero** `🟡` `🟡 PROPOSE` `⚙️ slopscore scan`
The lavender-to-indigo gradient (`#7c3aed → #4f46e5`, `from-purple-600 to-indigo-500`) that became the
unofficial flag of AI UIs — Lovable, Bolt, and Base44 all default to it because Notion/Linear/Vercel
marketing is over-represented in training data. The model learned "purple gradient = modern SaaS" and
applies it regardless of brand.
`DETECT:` `linear-gradient.*(purple|indigo|violet)` · `from-(purple|violet).*to-(indigo|blue)` · `#7c3aed|#4f46e5|#6d28d9` in gradient context.
`FIX:` Replace with a palette that has a point of view (Escape Move 1). Pick one brand hue from the actual product, demote the gradient to a flat surface or a subtle same-hue tint. Define it as a token (`--brand`), don't inline it. If the product has no brand yet, propose 2–3 directions rather than picking silently.

**002 · Sparkle / Wand icon on every AI button** `🟡` `🟡 PROPOSE` `⚙️ slopscore scan`
`<Sparkles/>`, `<Wand2/>`, or ✨ slapped on anything AI-adjacent. NN/g's 2025 research documented
"sparkle ambiguity" — users couldn't agree what it meant — yet it's everywhere. It signals "magic"
and nothing specific.
`DETECT:` `import.*(Sparkles?|Wand2?).*lucide` · `<Sparkles|<Wand2` · `✨` in labels.
`FIX:` Replace with an icon that names the actual action (pencil = edit, arrow-path = regenerate, text-cursor = autocomplete). If the action is genuinely "AI assist," use one consistent, deliberate mark — not the default sparkle. Remove purely decorative sparkles outright (that part is AUTO).

**003 · Glassmorphism cards (`backdrop-filter: blur`)** `🟡` `🟡 PROPOSE` `⚙️ slopscore scan`
Frosted-glass cards on a dark background. Had a real moment in 2022; LLMs absorbed it as "dark + blur =
premium." High GPU cost, frequently illegible, zero semantic meaning.
`DETECT:` `backdrop-filter.*blur` · `backdrop-blur-` · `bg-white/10|bg-black/20` with blur · `glass-card`.
`FIX:` Replace frosted panels with solid surfaces from a real elevation scale (e.g. `surface-1/2/3` tokens with increasing lightness or shadow). Reserve blur for genuine overlay-over-content cases. Verify text contrast after.

**004 · Aurora / mesh / radial decorative background** `🟡` `🟡 PROPOSE` `⚙️ slopscore scan`
Large radial "aurora" blobs or mesh gradients behind the hero for no reason. Carries no information,
competes with content, looks broken under ambient light.
`DETECT:` `radial-gradient`/`conic-gradient` as background · `bg-gradient-radial` · `aurora|mesh-gradient` · floating blob elements.
`FIX:` Delete it, or replace with a single restrained background treatment that serves hierarchy (one quiet tint, generous whitespace). If decoration is wanted, make it intentional and on-brand, not a default blob.

**005 · Dark mode by default with no elevation system** `🟠` `🟡 PROPOSE`
Permanent dark (`#0f0f0f`, `#111827`) with mid-grey body text and no thought to surface layers or
hierarchy. The single most common Show HN tell (34% of pages) — and these themes routinely fail WCAG AA
for body text. Promoted to 🟠 because it's an accessibility failure, not just a look.
`DETECT:` `bg-(gray|neutral|zinc)-950` as root · body text `text-gray-400` on dark · no light-mode class/media query anywhere.
`FIX:` Build a real surface scale (background → surface-1 → surface-2 → border) and lift body text to a contrast-passing value (≥ 4.5:1; usually `gray-200/300` on near-black). Offer a light mode or at minimum make dark a *choice*, not the only option. Verify with axe/Lighthouse.

**006 · Neon multi-color palette with no hierarchy** `🟡` `🟡 PROPOSE`
Five or six full-saturation accents (electric blue, hot pink, acid green) all shouting at once. Energetic
for ten seconds, exhausting after.
`DETECT:` 3+ high-saturation accents on one view · `#00ff88|#ff006e|#7700ff|#00d4ff` together · no primary/secondary token system.
`FIX:` Collapse to one primary + one accent + a neutral ramp. Define them as tokens. Let hierarchy come from weight, size, and space — not from a rainbow.

**007 · Decorative colored glows / box-shadows** `🟡` `🟡 PROPOSE`
Large colored shadows (`0 0 60px rgba(124,58,237,.5)`) and glow halos. Crypto/gaming residue; a glow
communicates nothing about state or hierarchy.
`DETECT:` `box-shadow.*rgba.*0\.[3-9]` with large spread · `shadow-(purple|blue|glow)` · colored `drop-shadow` · `text-shadow` with color.
`FIX:` Replace with a neutral, physically-plausible shadow scale (small/medium/large, low-alpha black) used to signal real elevation only. Drop glows entirely unless they encode a genuine state (e.g. focus ring).

**008 · Animated gradient text (`background-clip: text`)** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
Headline with gradient fill and/or animation. Screenshot-pretty, often unreadable, fails contrast
checkers — hence 🟠.
`DETECT:` `background-clip: text` · `-webkit-text-fill-color: transparent` · `bg-clip-text text-transparent` · `@keyframes gradient-text`.
`FIX:` Set the headline in a solid, contrast-passing color. If you want emphasis, use weight/size/a single accent word — not a gradient. Verify contrast.

**009 · Badge/pill directly above the H1** `🟡` `🟡 PROPOSE`
A "New ✨ / v2.0 / Introducing…" pill jammed above the hero headline. One of Krebs' top tells (18% of
pages); so automatic it reads as "AI wrote this hero without thinking."
`DETECT:` `<Badge>` immediately preceding `<h1>` · `rounded-full text-xs` sibling above h1 · "Introducing|Now available" in that pill.
`FIX:` Delete it unless it carries real, current information (an actual launch). If kept, make it specific and time-bound, and don't let it be the first thing the eye hits before the headline.

**010 · Centered hero + exactly three feature cards** `🟡` `🟡 PROPOSE`
Centered heading/subhead/CTA, then three icon-on-top cards in a row. The default skeleton every model
emits for "make a landing page" (icon-card grids in 22% of pages).
`DETECT:` hero → `grid-cols-3` of identical cards · three `FeatureCard` components with identical structure.
`FIX:` Commit to one strong layout primitive and repeat it (Escape Move 3) instead of the default skeleton. Vary card content density, break the three-up symmetry, or replace cards with a more honest representation of the product (a real screenshot, a worked example).

**011 · Identical icon-on-top feature cards** `🟡` `🟡 PROPOSE`
Cards that are structurally identical: icon, bold label, paragraph, same height. Bullet points in a
Halloween costume.
`DETECT:` `.map` producing identical `<Icon/><h3><p>` cards · all cards fixed equal height · no differentiation.
`FIX:` Don't fight the sameness with decoration — fight it with hierarchy. Promote the single highest-value feature to a wider/taller cell with a real product image; let the peers fall back to a plain text list, not more cards. If you can't rank them, that's the signal the grid is filler — replace it with prose. (010 is the centered-hero skeleton; this is the card grid itself.)

**012 · Colored left/top border on cards (the left-border tell)** `🟡` `🟡 PROPOSE` `⚙️ slopscore scan`
A 3–4px colored stripe on the card's left/top edge. A designer called it "almost as reliable a sign of
AI design as em-dashes are for AI text." Learned from "active item" and blockquote patterns, applied
globally.
`DETECT:` `border-[lt]-[24]` with a color class · `border-left: Npx solid` on cards · colored left border on >1–2 cards.
`FIX:` Remove the accent border. Use spacing, background, and type hierarchy to separate cards. Reserve a colored leading border for one genuine purpose (e.g. the single active/selected item).

**013 · Multicolored side tabs cycling every accent** `🟡` `🟡 PROPOSE`
Every card gets a *different* colored left border — red, blue, green, orange — because the model can't
reason about a global color budget. Four accents cancel each other out.
`DETECT:` different `border-color` per sibling card · `colors[index % colors.length]` applied to borders.
`FIX:` Kill the per-index color cycle (`colors[i % colors.length]`). Color may encode category only if the categories are a small, fixed, documented set with stable meaning; otherwise use one accent or none and let position and spacing separate items. (012 is a single colored border misused as decoration; this is the rainbow *cycle* across siblings.)

**014 · Decorative status dots that indicate nothing** `🟡` `🟡 PROPOSE`
Little colored circles on nav items, headers, and labels — not because state changed, but because they
look "data-rich." Meaningful in dev tools; meaningless when copied wholesale.
`DETECT:` `w-2 h-2 rounded-full bg-green-500` in static context · dots not bound to reactive state · hardcoded "online/active" dots.
`FIX:` Remove dots that aren't bound to real state. Where a dot *should* mean something, bind it to the actual value and give it an accessible label (not color alone).

**015 · Numbered "1, 2, 3" step section** `🟡` `🟡 PROPOSE`
"How it works" with three big-numbered circles. The default answer to "show a process" (17% of pages);
rarely matches how the product actually works.
`DETECT:` "Step 1/2/3" · numbered circles in a row · exactly-3 steps array.
`FIX:` Describe how the product *actually* works, in as many steps as that takes (often fewer or more than three). Replace generic step icons with real UI or outcomes. If the flow is genuinely three steps, keep it but make the copy specific.

**016 · Stat banner with big hardcoded numbers** `🟠` `🔴 FLAG`
"10,000+ Users · 99.9% Uptime · 5× Faster" — bold numbers, small labels, hardcoded. Made up, never
updated, or irrelevant. Reads as "placeholder" to any skeptic, and fabricated metrics are a trust/legal
issue — hence FLAG.
`DETECT:` hardcoded `10,000+|99.9%|5x|50k+` literals · stats with no data binding (no API/env).
`FIX:` Do not invent or "improve" the numbers. Flag each stat: is it true and sourced? If real, bind it to data or cite it. If unverifiable, recommend removing it. Never silently fabricate social proof.

**017 · Emoji as nav/sidebar icons** `🟡` `🟢 AUTO`
🏠 Home · ⚙️ Settings · 📊 Analytics. Signals that no iconography decision was made.
`DETECT:` emoji in nav/sidebar labels · `🏠|⚙️|📊|👤|🔔|🚀` in `<NavItem>`/`<SidebarLink>`.
`FIX:` Swap to one consistent icon set (the one already in the project) at a single size token. Mechanical — safe to AUTO. Keep labels; don't rely on the icon alone.

**018 · ALL-CAPS section labels** `🟡` `🟢 AUTO`
`FEATURES`, `HOW IT WORKS`, `PRICING` in uppercase with wide tracking. A 2019–2021 SaaS habit that
aged badly and hurts readability.
`DETECT:` `uppercase`/`text-transform: uppercase` on headings · `letter-spacing ≥ 0.1em` + uppercase · literal SHOUTING labels.
`FIX:` Sentence case (or Title Case if the design system uses it). Remove forced uppercase; if you want a label treatment, use size/weight/color. Safe to AUTO.

**019 · Bento grid with even content density** `🟡` `🟡 PROPOSE`
Apple-style bento with mixed cell sizes — but every cell carries the same amount of content, defeating
the point.
`DETECT:` a grid of mixed `col-span-*`/`row-span-*` cells where content per cell (text length, field count) varies by less than ~20% · every cell is the same component with the same fields.
`FIX:` A bento earns its irregular cells only if the content is irregular. Put the hero metric/feature in the largest cell with the most content; if every cell holds one stat and one label, drop the spans and ship a uniform grid — it's more honest and reads cleaner.

**020 · Confetti / particle / floating-orb animations** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
Confetti on submit, particle backgrounds, drifting blobs. Pure cognitive noise.
`DETECT:` `canvas-confetti|react-confetti|tsparticles` imports · `<Particles>` · `@keyframes float` on decorative els.
`FIX:` Remove. (If a single celebratory moment is genuinely part of the product — e.g. completing onboarding — keep exactly one, reduced-motion-aware, and downgrade to PROPOSE.) Respect `prefers-reduced-motion` regardless.

---

### CATEGORY 2 — Typography Tells

**021 · Inter for absolutely everything** `🟡` `🟡 PROPOSE`
Inter on headings, body, labels, and code — the Helvetica of the LLM era. Every generated page defaults
to it.
`DETECT:` `font-family: 'Inter'` as sole declaration · only Inter imported · no heading/body variation.
`FIX:` Pick a typeface with a point of view and pair it with a distinct body font (Escape Move 2): e.g. Geist, Söhne, Untitled Sans, Tiempos, Migra, Inktrap. The heading/body contrast wakes the page up. Define `--font-display`/`--font-body` tokens.

**022 · The recycled combos (Space Grotesk + Instrument Serif / Geist / Syne)** `🟡` `🟡 PROPOSE` `⚙️ slopscore scan`
The short list the model cycles through after Inter, lifted from a few influential showcases that became
training data.
`DETECT:` `'Space Grotesk'`, `'Instrument Serif'`, `Geist`, `Syne`, `'Plus Jakarta'` as the only choices, uncustomized.
`FIX:` Choose fonts because they fit *this* product's voice, not because they're the safe pairing. Set a real type scale (sizes, weights, line-heights) so the choice reads as deliberate.

**023 · Serif italic on exactly one hero word** `🟡` `🟡 PROPOSE`
An all-sans headline with one word in italic serif (Instrument/Lora/Playfair) for "personality." Copied
so often it now reads as the template itself.
`DETECT:` `<em>/<i>` with a different `font-family` inside `h1/h2` · italic-serif class on one word.
`FIX:` Either drop the ornament or make the emphasis structural and meaningful. If you keep an accent word, make sure it's the word that actually matters and that the pairing is intentional, not reflexive.

**024 · ALL-CAPS buttons** `🟡` `🟢 AUTO`
`GET STARTED NOW`, `LEARN MORE`. Reads as shouting; degrades readability.
`DETECT:` `uppercase` on `<button>` · all-caps button literals.
`FIX:` Sentence case the label. Safe to AUTO.

---

### CATEGORY 3 — Layout & Structural Anti-Patterns

**025 · Cards within cards within cards** `🟠` `🟡 PROPOSE`
Nesting until every piece of content is equally contained and nothing reads as important. Three+ levels
(`rounded-xl` > `rounded-lg` > `rounded-md`).
`DETECT:` nested `<Card>` 3+ deep · `bg-gray-100` inside `bg-white` inside `bg-gray-50` containers.
`FIX:` Flatten. Keep one level of containment per logical group; let spacing and headings do the rest. Containers should be earned by genuine grouping, not reflexively wrapped.

**026 · Everything centered** `🟡` `🟡 PROPOSE`
Every section/heading/paragraph `text-center`. The model's "safe" choice; flattens hierarchy and makes
rivers of whitespace.
`DETECT:` `text-center` on every section (not just hero) · all body paragraphs centered.
`FIX:` Left-align body content and most sections; reserve centering for short hero text and genuinely symmetrical moments. Reading is easier left-aligned.

**027 · `border-radius: 9999px` on non-pill elements** `🟡` `🟢 AUTO`
Full rounding on cards, inputs, modals, panels — "max rounding = modern." Everything becomes a pill.
`DETECT:` `rounded-full` on containers (not buttons/badges) · `border-radius: 9999px|100px` on panels.
`FIX:` Apply one radius token scale (e.g. `--radius` 8–12px for cards, full only for true pills/avatars). Replace stray `rounded-full` on containers. Largely mechanical — AUTO with a quick visual check.

**028 · `<hr>` divider between every section** `🟡` `🟢 AUTO`
A rule between every section, creating a newspaper-column effect where whitespace should breathe.
`DETECT:` `<hr>`/`border-t` between every section · `divider` repeated 3+ times with no rhythm.
`FIX:` Remove most dividers; use vertical space to separate sections. Keep a divider only where it marks a genuine shift. AUTO.

**029 · Hero text with no max-width (120+ char lines)** `🟠` `🟢 AUTO`
Subtitle stretches full width; line length blows past the readable 60–80 characters.
`DETECT:` hero/subtitle `<p>` with no `max-w` · `width: 100%` with no `max-width`.
`FIX:` Constrain prose to a readable measure (`max-w-prose`, ~60–75ch). AUTO — purely a readability fix.

**030 · The identical left-rail sidebar app shell** `🟡` `🟡 PROPOSE`
Fixed left sidebar + top header + main content, generated identically by Lovable/Bolt/Base44/v0. Strip
the logo and you can't tell them apart.
`DETECT:` default shadcn `<SidebarProvider><Sidebar><SidebarContent>` with no customization · architectural, not a regex.
`FIX:` Customize the shell to the product: rethink nav grouping, spacing, density, and whether a sidebar is even the right primitive. At minimum, make it not the untouched template. PROPOSE — this is structural.

---

### CATEGORY 4 — Iconography Anti-Patterns

**031 · Lucide defaults, zero customization** `🟡` `🟡 PROPOSE`
Every icon from lucide-react at `size={24}`, `strokeWidth={2}`. Not wrong, but reads as a Lucide
showcase, not a product.
`DETECT:` all icons lucide-react with no size/stroke customization · same 5–10 icons everywhere · no icon wrapper enforcing a token.
`FIX:` Create one `<Icon>` wrapper that enforces size and stroke tokens; tune stroke/size to match your type weight. Curate the set rather than reaching for the obvious five.

**032 · `Wand2` as the universal AI button** `🟡` `🟡 PROPOSE`
The "other" AI icon alongside Sparkles. Wand + Sparkles on one page = peak vibe-coded.
`DETECT:` `import.*Wand2?` · `<Wand2|<WandSparkles>`.
`FIX:` An icon shouldn't promise "magic" — it should name what happens. Swap the wand for a glyph of the real action (generate → document, summarize → list, rewrite → pencil). Wand2 *and* Sparkles on one screen is the single strongest visual tell — cut at least one. (Sibling of 002; this one is specifically the "magic wand" framing.)

**033 · Bot / Brain / Cpu / Zap as the product's identity** `🟡` `🟡 PROPOSE`
Using these four as the brand/logo mark for an AI product. Instantly reads as "I asked the AI what icon
to use."
`DETECT:` `<Bot|<Brain|<Cpu|<Zap` in logo/brand position next to the product name.
`FIX:` Use a real wordmark or a distinctive mark. If you must use an icon as a placeholder, pick one that relates to what the product *does*, not to "AI" generically. PROPOSE (brand is a human call).

**034 · Mixing icon libraries** `🟠` `🟡 PROPOSE`
Lucide here, Heroicons there, FontAwesome for a logo, emoji for nav. Different weights and grids; the
set looks incoherent.
`DETECT:` imports from 2+ icon packages · inconsistent stroke widths on one page.
`FIX:` Standardize on one library. Migrate strays. Remove the unused icon packages from `package.json` (smaller bundle, fewer CVEs). The migration is mechanical but choosing the survivor is a call — PROPOSE.

**035 · Inconsistent icon sizes (random px, no token)** `🟡` `🟢 AUTO`
14px here, 24px there, 32px elsewhere, by feel.
`DETECT:` `size={14/18/20/32}` used inconsistently · `w-3 h-3` vs `w-5 h-5` vs `w-8 h-8` on the same UI role · no `ICON_SM/MD/LG` token.
`FIX:` Define a small size scale and apply it via the `<Icon>` wrapper. Snap stray sizes to the nearest token. AUTO.

---

### CATEGORY 5 — shadcn/ui & Component-Library Anti-Patterns

**036 · Unmodified shadcn defaults shipped as final** `🟠` `🟡 PROPOSE`
shadcn components pasted with zero customization to tokens, radius, shadows, or variants. The library is
explicitly a *starting point*; shipping it untouched is shipping Times New Roman because it was the
default.
`DETECT:` `components.json` with default `slate`/`zinc` theme · no changes in `tailwind.config` beyond shadcn defaults · `--radius: 0.5rem` unchanged · default `--primary`/`--secondary`.
`FIX:` Customize the token layer: brand color, radius, shadow scale, and at least one component variant. The components stay; the *defaults* go. PROPOSE — it's a design pass.

**037 · Everything wrapped in `<Card>`** `🟠` `🟡 PROPOSE`
Every stat, form, text block, and list inside a `<Card>`. Cards mean "independently actionable"; when
everything is a card the page is a filing-cabinet simulator.
`DETECT:` `<Card>` used >8× on one route · non-actionable content (plain text/stats/labels) in `<Card>`.
`FIX:` Reserve cards for genuinely grouped, actionable units. Replace the rest with plain sections separated by space and headings. Reduces nesting (see 025) too.

**038 · A `<Badge>` above every heading** `🟡` `🟢 AUTO`
`<Badge>New</Badge>`, `<Badge>Beta</Badge>` as a label above each heading — "making content feel
categorized."
`DETECT:` `<Badge>` immediately preceding `h1/h2/h3` · Badge used 5+× as a section label.
`FIX:` Remove decorative badges. Keep a badge only where it carries real status that the user needs. AUTO for the decorative ones.

**039 · `<Separator>` between every list item** `🟡` `🟢 AUTO`
Horizontal lines where whitespace and type should do the work.
`DETECT:` `<Separator/>` inside `.map()` · `<Separator>` 5+× on one page.
`FIX:` Remove inter-item separators; use spacing. Keep one only at a genuine section boundary. AUTO.

**040 · `<Sheet>`/Drawer for everything** `🟠` `🟡 PROPOSE`
Slide-over panels for two-field forms and confirmations, because the model treats Sheet as a
general-purpose overlay.
`DETECT:` `<Sheet>` for simple confirmations/small forms · delete-confirm inside a Sheet instead of `<AlertDialog>`.
`FIX:` Match the affordance to the task: `<AlertDialog>` for confirmations, inline editing for small edits, `<Dialog>` for focused forms, Sheet only for substantial side content. PROPOSE — it's a UX call.

---

### CATEGORY 6 — Copy & Content Anti-Patterns

**041 · AI buzzword copy** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
"Supercharge your workflow," "Harness the power of AI," "Unlock your potential," "Revolutionize the way
you work," plus the adverb tells: *seamlessly, effortlessly, intuitively*. Generated because they
saturate AI marketing in training data. They communicate nothing.
`DETECT:` `supercharge|harness the power|unlock your|revolutionize|next-generation|cutting-edge|state-of-the-art|game-changing` · `seamlessly|effortlessly|intuitively` in feature copy.
`FIX:` Replace with concrete, specific claims: what it does, for whom, and the actual outcome. "Turn a 3-hour reconciliation into one click" beats "Supercharge your finances." PROPOSE — copy is product voice; show rewrites, don't invent facts.

**042 · Lorem ipsum in production** `🟠` `🔴 FLAG` `⚙️ slopscore scan`
Placeholder Latin that was never replaced. Immediate trust killer.
`DETECT:` `lorem ipsum|dolor sit amet|consectetur adipiscing` in any string.
`FIX:` Flag every instance with its location — you usually can't write the real copy without product knowledge. Propose real text where it's obvious; otherwise mark it for the human. Don't ship plausible-sounding filler in its place.

**043 · "Coming soon" placeholders that never ship** `🟠` `🔴 FLAG` `⚙️ slopscore scan`
"Coming soon," "Under construction," "🚧 WIP" that's been there since launch.
`DETECT:` `coming soon|under construction|work in progress|🚧` in UI · `<ComingSoon/>` in a real route · TODO-as-UI-text.
`FIX:` Flag — this may be a real roadmap promise or genuinely incomplete work. Recommend either building it, hiding the entry, or replacing with an honest empty state. Don't silently delete a feature the team intends to ship.

**044 · "Oops! Something went wrong" errors** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
Cute, unhelpful errors (often with 😅/🙃) that say nothing about what happened or what to do.
`DETECT:` `oops|uh oh|whoops|something went wrong` · error strings ending in 😅🙃😬 · generic catch-all text.
`FIX:` Make errors specific and actionable: what failed, why if known, and the next step ("Couldn't save — check your connection and retry"). Pair with a real recovery path, not a reload. PROPOSE — wording + behavior change.

**045 · Exclamation points on every CTA** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
`Get Started Now!`, `Sign Up Free!`, `Try it Today!`. Reads as yelling.
`DETECT:` button text ending in `!`.
`FIX:` Drop the exclamation. Confident, not exclamatory. AUTO.

**046 · "Submit" as the only button label** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
`<button type="submit">Submit</button>` with no semantics.
`DETECT:` `>Submit<` · `value="Submit"`.
`FIX:` Name the action: "Save changes," "Create account," "Send message," "Book appointment." AUTO — infer the verb from the form's purpose.

**047 · "Click here" link text** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
`<a>Click here</a>`. Describes the mechanism, not the destination; breaks screen-reader navigation.
`DETECT:` `>click here<|>tap here<|>here</a>`.
`FIX:` Rewrite link text to name the destination ("Read the pricing guide"). AUTO + an a11y win.

**048 · Generic input placeholders** `🟡` `🟢 AUTO`
`placeholder="Enter text here"`, `"Type something…"`, or a placeholder that just restates the label.
`DETECT:` `placeholder="Enter text here|Type something"` · placeholder == label.
`FIX:` Show a real example of valid input (`placeholder="jane@company.com"`). Never use placeholder as the only label (see 085). AUTO.

**049 · Feature names: "Smart X" / "AI-Powered X" / "Next-Gen X"** `🟡` `🟡 PROPOSE`
"Smart Dashboard," "AI-Powered Analytics," "Next-Gen Search." Tell the user nothing.
`DETECT:` `Smart |AI-Powered |Next-Gen |Intelligent |Advanced |Enhanced ` as feature-name prefixes.
`FIX:` Rename by function/outcome ("Anomaly alerts," "Full-text search across all docs"). PROPOSE — names are product decisions.

**050 · Inconsistent capitalization across the UI** `🟡` `🟡 PROPOSE`
Title Case, ALL CAPS, sentence case, and lowercase mixed with no system.
`DETECT:` the same kind of label (e.g. nav items, buttons) using 2+ casing conventions across the app · inconsistent casing within one component.
`FIX:` PROPOSE to pick the convention (sentence case is the modern default, but the brand may mandate Title Case — that's a human call); once chosen, enforcing it across labels/buttons/headings is mechanical (AUTO).

**051 · Comments that narrate *what*, not *why*** `🟡` `🟢 AUTO`
`// Check if user is authenticated`, `// Return the result`, `// Step 1: Validate input`. Humans comment
on *why*; numbered procedure comments are a strong AI-authorship tell.
`DETECT:` `// Step N:` · `// Check if|// Return the|// Get the` restating the next line · docstrings longer than trivial bodies.
`FIX:` Delete comments that restate the code. Keep/improve comments that explain intent, trade-offs, or non-obvious constraints. AUTO for pure narration; leave anything that might encode real reasoning.

---

### CATEGORY 7 — Code Quality Anti-Patterns

**052 · `console.log` in production paths** `🟠` `🟢 AUTO` `⚙️ slopscore scan`
Debug logging left in shipping code (`console.log("User:", user)`).
`DETECT:` `console\.(log|dir|table|debug)\(` in non-test, non-logger files.
`FIX:` Remove, or route through a real logger with levels. Keep intentional logging in designated logging modules. AUTO outside logger utilities.

**053 · Empty catch blocks (silent error swallowing)** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`try {…} catch (e) {}`. The error vanishes; the user sees nothing; the bug hides forever. The model
"handles errors" without knowing what to do with them.
`DETECT:` `catch (\w*) {}` · catch containing only a comment · `except: pass`.
`FIX:` At minimum log with context; better, handle or rethrow, and surface a real message to the user where relevant. PROPOSE because the *right* handling is context-specific — never leave it empty, but don't guess the recovery logic silently.

**054 · TypeScript `any` everywhere** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
`: any`, `as any`, `Record<string, any>`. Defeats the point of TypeScript; the model reaches for `any`
when it doesn't know the type.
`DETECT:` `: any` · `as any` · `Record<string, any>` · `[key: string]: any` (exclude `.d.ts` shims).
`FIX:` Replace with the real type, `unknown` + narrowing, or a proper generic. Where a third-party type is genuinely missing, define a minimal interface. PROPOSE — typing requires understanding the data shape.

**055 · God components (800–1000+ line files)** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
One file that fetches, transforms, holds complex state, and renders a huge tree. The model completes
holistically without architecture. In field scans, god functions led all findings (~38%).
`DETECT:` component files > 800 lines · multiple fetches + complex state + large JSX in one file · no sub-component extraction.
`FIX:` Extract sub-components, move data fetching into hooks/services, lift shared state deliberately. Split along genuine seams — don't just chop by line count into new god components. PROPOSE; do it on a branch and keep behavior identical.

**056 · God functions (200+ lines)** `🟠` `🟡 PROPOSE`
Functions doing far too much. vibecop flags ~50+ lines; 200+ is structural.
`DETECT:` JS/TS functions > 200 lines · Python > 100 · one function with multiple responsibilities.
`FIX:` Decompose by responsibility into named, testable helpers. Preserve behavior; add tests around the seam first if none exist. PROPOSE. (055 is the file/component scope; this is a single oversized function inside an otherwise-fine file.)

**057 · TODO / FIXME / HACK in production** `🟡` `🔴 FLAG` `⚙️ slopscore scan`
`// TODO: add error handling`, `// FIXME: this is broken`, `// HACK: temporary`. Placeholders the model
expected to fill and didn't.
`DETECT:` `(TODO|FIXME|HACK|XXX):` in source.
`FIX:` Flag each with location and content. A TODO is a real (often important) note — convert it into a tracked issue or resolve it, but don't silently delete debt markers that may flag known gaps. FLAG, then resolve case-by-case.

**058 · Hardcoded API keys & secrets** `🔴` `🔴 FLAG` `⚙️ slopscore scan`
`const API_KEY = "sk-proj-…"` in source. The model puts credentials wherever the code needs them.
`DETECT:` `API_KEY = "…{16,}"` · `sk-|pk-|rk-|Bearer <token>` · `password = "…{8,}"` in non-test source. Run gitleaks/trufflehog over history too.
`FIX:` Move the value to an env var / secret manager and reference it. **But FLAG loudly: a committed secret is compromised — tell the human to revoke and rotate it immediately**, and to scrub git history (`git filter-repo` / BFG). You may do the env migration; you cannot rotate the key.

**059 · Generic variable names: `data`, `result`, `response`, `item`** `🟡` `🟡 PROPOSE`
`data`, `result`, `response`, `value`, `item` throughout. Incomprehensible at scale.
`DETECT:` `const data =|const result =|const response =` as primary names · `.map(item =>` everywhere · `handleData/processResult`.
`FIX:` Rename to the domain concept (`invoices`, `parsedRows`, `stripeCustomer`). PROPOSE — renaming touches many call sites; do it with a refactor tool and verify.

**060 · Placeholder component names: `NewComponent`, `Component2`, `TestPage`, `Temp`** `🟡` `🟡 PROPOSE` `⚙️ slopscore scan`
Names never replaced after generation.
`DETECT:` `NewComponent|Component2|TestComponent|TempComponent` · `TestPage|DemoPage|SamplePage` in routes · `Placeholder|Draft|Untitled`.
`FIX:` Rename to what they are. Verify imports/routes after. Delete if they're truly unused scaffolding (confirm first). PROPOSE.

**061 · Multiple versions of the same file** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
`index.js`, `index2.js`, `index_final.js`, `index_v2.js`, `index_backup.js` side by side. AI iteration
creates new files instead of editing.
`DETECT:` `_v2|_v3|_final|_old|_backup|_copy` suffixes · `Foo 2.tsx` · near-duplicate files in one dir.
`FIX:` Identify the live one (check imports/routes), confirm with the human, delete the dead copies, and rely on git for history. PROPOSE — deleting files needs confirmation that nothing imports them.

**062 · Commented-out dead code blocks** `🟡` `🟢 AUTO`
Large commented-out sections kept "just in case." Git already remembers.
`DETECT:` 5+ consecutive `//` / `/* */` lines of code · commented-out import blocks · `// Old implementation:` followed by code.
`FIX:` Delete it. Version control is the backup. AUTO (but keep license headers and intentional doc comments).

**063 · Magic numbers, no named constants** `🟠` `🟡 PROPOSE`
`if (status === 3)`, `setTimeout(fn, 3000)` with no explanation of what 3 or 3000 mean.
`DETECT:` numeric literals in conditionals (`=== 1/2/3`) · hardcoded `setTimeout(…, 3000/5000)` · magic array indices · no `STATUS_/TYPE_/DURATION_` constants.
`FIX:` Extract to named constants/enums (`STATUS.SHIPPED`, `RETRY_DELAY_MS`). PROPOSE — naming requires knowing the meaning; ask if unclear rather than guessing.

**064 · Unused imports everywhere** `🟡` `🟢 AUTO`
`import { Button, Card, Dialog, Sheet }` where only Button is used. The model imports everything it might
need.
`DETECT:` ESLint `no-unused-vars` · imports where >50% are unused · `import React` in JSX-transform files.
`FIX:` Run the linter's autofix / `knip`. Remove unused imports. AUTO.

**065 · `setTimeout` to "fix" race conditions** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
`setTimeout(() => doThing(), 500)` to paper over timing. Cargo-cult: delay and hope.
`DETECT:` `setTimeout(…, [1-9]\d{2,})` in logic · "wait for render" comments before a timeout.
`FIX:` Fix the actual ordering — await the real promise, use the framework's lifecycle/effect, a ref callback, or proper state. Remove the magic delay. PROPOSE — requires understanding the real dependency.

**066 · `useEffect` with wrong/missing dependency arrays** `🟠` `🟡 PROPOSE`
`useEffect(() => fetchData())` with no array (runs every render), or `eslint-disable exhaustive-deps`
to silence the warning instead of fixing it.
`DETECT:` `useEffect(() => {…})` with no second arg · `eslint-disable.*exhaustive-deps` · obviously-wrong `[]`.
`FIX:` Add the correct deps; if that causes loops, fix the root cause (memoize, move logic, use a ref) instead of disabling the rule. PROPOSE.

**067 · All state in one giant `useState` object** `🟠` `🟡 PROPOSE`
`useState({ loading, data, error, modal, form, user })` — one blob for the whole component.
`DETECT:` `useState({ loading, data, error, modal, form` · large `setState(prev => ({...prev,…}))` · one state for 5+ concerns.
`FIX:` Split into focused `useState`s or a `useReducer` with named actions; lift server state into a query library (see 097). PROPOSE.

**068 · Copy-pasted duplicated code instead of abstraction** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
Identical blocks across files — the single biggest measured AI-code-quality regression (duplicated
blocks up 4–8×; copy/paste now exceeds refactoring). Each block is a future inconsistency bug.
`DETECT:` identical fetch/validation/util blocks in multiple components · `jscpd`/vibecop cross-file duplication.
`FIX:` Extract the shared logic into one function/hook/module and call it from all sites. This is *the* refactor AI skips and you must do. PROPOSE; verify all call sites behave identically.

**069 · Step-narration comments inside functions** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
`// Step 1: Validate`, `// Step 2: Process`, `// First… // Then… // Finally…`. Humans don't number
procedure steps in comments.
`DETECT:` `// Step N:|# Step N:` · `// Phase N:` · sequential `// First/Then/Finally` narration.
`FIX:` Remove the numbered narration; if the steps mark real sub-tasks, extract them into named functions instead. AUTO. (051 is the general "comments narrate what, not why" tell; this is the specific numbered-step signature the CLI automates.)

**070 · Hallucinated API calls on non-existent methods** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`fetch.get()`, `array.flatten()`, `string.capitalize()`, `promise.done()`. Looks plausible, breaks at
runtime.
`DETECT:` `fetch\.(get|post)\(` · `.flatten(` · `.capitalize(` · `promise.done(` · `.toArray()` on Set/Map.
`FIX:` Replace with the real API (`fetch(url,{method})`, `.flat()`, a real title-case helper, `.then()`/`await`, `[...set]`). Run the typechecker and tests to confirm. PROPOSE; verify it actually executes.

**071 · `dangerouslySetInnerHTML` / `.innerHTML` without sanitization** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
Rendering user/remote content as raw HTML without sanitizing — an XSS hole.
`DETECT:` `dangerouslySetInnerHTML={{…}}` · `.innerHTML =` · either without DOMPurify/sanitize-html.
`FIX:` Render as text where possible. If HTML is required, sanitize with DOMPurify and an allowlist before injecting. PROPOSE — confirm what content actually flows in. Treat any path carrying user/remote data as 🔴.

**072 · SQL injection via template literals** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`` `SELECT * FROM users WHERE id = ${userId}` `` straight into a query.
`DETECT:` `` `(SELECT|INSERT|UPDATE|DELETE)…${ `` · ``db.query(`…)`` with interpolation.
`FIX:` Use parameterized queries / prepared statements / the ORM's binding. Never interpolate user input into SQL. PROPOSE; verify the query still returns the same results.

**073 · Auth tokens in `localStorage`** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`localStorage.setItem('token', jwt)` — readable by any script, including XSS payloads.
`DETECT:` `localStorage\.(set|get)Item\(.*(token|jwt|auth)`.
`FIX:` Move to `httpOnly`, `Secure`, `SameSite` cookies set by the server. This touches the auth flow end-to-end, so PROPOSE and coordinate the change across client + server.

**074 · N+1 query patterns** `🟠` `🟡 PROPOSE`
`users.map(u => await getPermissions(u.id))` — one query per item. Cheap locally, deadly at scale; also
inflates the cloud bill that's now a documented vibe-coding failure mode.
`DETECT:` `await db.query` inside `.map()/.forEach()` · SELECT inside a loop · N queries for N items, no JOIN/batch.
`FIX:` Batch into one query (JOIN, `WHERE id IN (…)`, or a dataloader). PROPOSE; verify result parity and measure.

**075 · Excessive, meaningless docstrings** `🟡` `🟢 AUTO`
Ten-line docstrings on `add(a, b)` restating the type annotations. "Helpful and documented" taken to
parody.
`DETECT:` docstrings longer than the body · Google/NumPy docstrings on trivial utilities · JSDoc on self-documenting functions.
`FIX:` Trim to one line or delete on trivial functions; keep substantive docs on public APIs and non-obvious behavior. AUTO for the obvious cases.

**076 · Placeholder values in production config** `🔴` `🔴 FLAG` `⚙️ slopscore scan`
`YOUR_API_KEY_HERE`, `REPLACE_WITH_YOUR_TOKEN`, `example@email.com`, `http://example.com` as live
defaults.
`DETECT:` `YOUR_API_KEY_HERE|REPLACE_ME|INSERT_YOUR|ADD_YOUR` · `example@email.com` default · `placeholder|dummy|test123` as default secret.
`FIX:` Flag each — the real value is environment-specific and may be secret. Replace with a required-env-var read that fails loudly if unset (don't ship a fake default that silently "works" then breaks). FLAG.

**077 · Double type assertions** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
`(value as unknown) as SpecificType` — the escape hatch when `as SomeType` won't compile.
`DETECT:` `as unknown as` · `as any as`.
`FIX:` Find the real type mismatch and fix it (correct the source type, add a type guard, fix the generic). The double-assert hides a real bug surface. PROPOSE.

**078 · Overly broad exception handling** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
`except Exception as e:` / `catch (e: any)` catching everything and handling it all the same (usually
log-and-swallow).
`DETECT:` `except Exception/BaseException as` · `catch (e: any)` without narrowing · one catch for all error types.
`FIX:` Catch specific, expected errors and handle each meaningfully; let unexpected ones propagate to an error boundary (101). PROPOSE.

**079 · Unused dependencies (bloat + CVE surface)** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
150+ deps for a CRUD app, many "in case." Unused deps still ship CVE exposure.
`DETECT:` 100+ runtime deps · packages imported nowhere (`knip`/`depcheck`) · overlaps (moment+date-fns, axios+node-fetch).
`FIX:` Remove unused and duplicate-purpose deps; consolidate. Re-run install + tests + `npm audit`. PROPOSE; confirm nothing dynamically requires them.

**080 · README that only says "TODO: add documentation"** `🟡` `🟡 PROPOSE` `⚙️ slopscore scan`
The README never written.
`DETECT:` README < 20 lines of real content · only boilerplate/TODO · no install or usage.
`FIX:` Write a real README: what it is, install, run, key scripts, and architecture in a paragraph. You can draft this from the code. PROPOSE so the human can correct product framing.

---

### CATEGORY 8 — Accessibility Anti-Patterns

> Most of Category 8 is 🟢 AUTO and 🟠 — accessibility fixes are mechanical and almost never controversial.
> Run axe-core/Lighthouse/pa11y to confirm before and after.

**081 · Images without alt text** `🟠` `🟢 AUTO` `⚙️ slopscore scan`
`<img src="hero.png">` with no `alt`. Fails WCAG 1.1.1.
`DETECT:` `<img>` with no `alt` · `<Image>` (Next) with no `alt` prop.
`FIX:` Add descriptive `alt` for meaningful images; `alt=""` for decorative ones. AUTO — infer from filename/context; flag any you genuinely can't describe.

**082 · Interactive `<div>`/`<span>`** `🟠` `🟢 AUTO` `⚙️ slopscore scan`
`<div onClick=…>` instead of `<button>`. No keyboard focus, no Enter/Space, not announced as a button.
`DETECT:` `<(div|span) … onClick` without `role="button"` + key handler.
`FIX:` Convert to `<button>` (or `<a>` for navigation). If it must stay a div, add `role`, `tabIndex={0}`, and a keydown handler — but prefer the real element. AUTO.

**083 · Focus removed via `outline: none`** `🟠` `🟢 AUTO` `⚙️ slopscore scan`
`* { outline: none }` with no replacement. Keyboard users lose the cursor.
`DETECT:` `outline: none|0` · `outline-none` with no `:focus-visible` alternative.
`FIX:` Provide a visible `:focus-visible` style (ring/outline) everywhere focus is removed. AUTO.

**084 · Icon-only buttons with no label** `🟠` `🟢 AUTO`
`<button><SearchIcon/></button>` announced as just "button."
`DETECT:` button containing only an icon, no `aria-label`/`title`/sr-only text.
`FIX:` Add `aria-label` describing the action. AUTO.

**085 · Form inputs not associated with labels** `🟠` `🟢 AUTO`
`<label>Email</label><input>` with no `htmlFor`/`id` link, or placeholder-as-label.
`DETECT:` `<label>` without `htmlFor` · `<input>` without `id` when a label exists · placeholder-only inputs.
`FIX:` Wire `htmlFor`↔`id` (or wrap the input in the label). Add a real visible label where only a placeholder exists. AUTO.

**086 · Poor color contrast (fails WCAG AA)** `🟠` `🟡 PROPOSE`
Grey-on-white, light-on-light, or color-on-color below 4.5:1 (3:1 large). Endemic in AI dark themes
(`text-gray-400` on dark).
`DETECT:` `text-gray-300/400` on dark · `text-gray-500` on white · run axe/Lighthouse.
`FIX:` Raise text/background contrast to pass AA. This may shift the palette, so PROPOSE — but never leave a failing ratio. Re-test with a contrast tool.

**087 · Modals that don't close on Escape** `🟠` `🟢 AUTO`
No keydown handler for Escape on dialogs. Violates WCAG 2.1.1.
`DETECT:` modal/dialog with no Escape keydown handling.
`FIX:` Add Escape-to-close (or adopt an accessible dialog primitive like Radix/shadcn `<Dialog>` that handles it). AUTO.

**088 · Modals that don't close on backdrop click** `🟡` `🟢 AUTO`
Clicking the dark backdrop does nothing; users feel trapped.
`DETECT:` overlay div with no `onClick` close · `<DialogOverlay>` with no dismiss.
`FIX:` Add backdrop-click-to-dismiss (with click-outside guarded to the overlay, not the content). AUTO. (Keep it disabled only for genuinely blocking flows — then it's PROPOSE.)

**089 · No keyboard nav in custom dropdowns/menus** `🟠` `🟡 PROPOSE`
Div+onClick menus with no arrow keys, focus management, or Escape.
`DETECT:` custom dropdown with no focus management · menu items without `role="menuitem"`/`tabIndex` · no Arrow/Escape handlers.
`FIX:` Replace with an accessible primitive (Radix/Headless UI/shadcn) or implement roving tabindex + Arrow/Home/End/Escape + focus trap. PROPOSE — it's a rebuild.

**090 · Missing skip links / landmarks** `🟡` `🟢 AUTO`
No "Skip to main content"; no `<main>/<nav>/<header>` landmarks.
`DETECT:` no `<a href="#main">` skip link · no landmark regions.
`FIX:` Add a skip link and wrap regions in semantic landmarks. AUTO.

---

### CATEGORY 9 — Performance Anti-Patterns

**091 · Unoptimized images (massive PNGs)** `🟠` `🟡 PROPOSE`
5 MB hero PNGs served raw — no WebP/AVIF, no `srcset`, no dimensions (→ layout shift).
`DETECT:` `.png/.jpg` > 500 KB in `/public` · `<img>` with no width/height · no `loading="lazy"` below the fold · no `next/image`.
`FIX:` Compress, convert to WebP/AVIF, add explicit dimensions, add `loading="lazy"` off-screen, and use the framework image component. PROPOSE — it touches assets and build.

**092 · No lazy loading for images or heavy components** `🟡` `🟡 PROPOSE`
Everything eager; all routes in one chunk.
`DETECT:` no `React.lazy()`/dynamic `import()` for route components · no `Suspense` boundary.
`FIX:` Code-split routes and heavy components with `lazy()`/dynamic import + `Suspense`; lazy-load off-screen media. PROPOSE. (This is the missing *runtime* lazy/Suspense; 098 is the *build* emitting a single un-split bundle — fix both.)

**093 · Importing whole libraries for one utility** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
`import _ from 'lodash'` for one `debounce`; whole-`moment` imports.
`DETECT:` `import _ from 'lodash'` · `import * as R from 'ramda'` · `import moment`.
`FIX:` Use named/tree-shakable imports (`import debounce from 'lodash/debounce'`) or smaller alternatives (date-fns, native Intl). AUTO with a bundle re-check.

**094 · Sequential awaits instead of `Promise.all`** `🟠` `🟢 AUTO`
Three independent `await`s in a row that could run in parallel.
`DETECT:` 3+ sequential `await` fetches with no data dependency.
`FIX:` `Promise.all([...])` for the independent calls; keep sequencing only where one result feeds the next. AUTO — verify there's truly no dependency.

**095 · No debouncing on search/filter inputs** `🟠` `🟢 AUTO`
`onChange={e => fetchSearchResults(e.target.value)}` — a request per keystroke.
`DETECT:` `onChange` calling an API directly on a text input · no debounce.
`FIX:` Debounce (250–400 ms) or throttle the handler; cancel in-flight requests. AUTO.

**096 · Polling every second, no backoff or cleanup** `🟠` `🟡 PROPOSE`
`setInterval(fetchData, 1000)` with no backoff and no `clearInterval` on unmount (memory leak).
`DETECT:` `setInterval(…fetch…)` in a component · no `clearInterval` in cleanup · interval < 5 s.
`FIX:` Add the cleanup (AUTO part), raise the interval, add backoff, and prefer WebSocket/SSE or a query library's refetch where appropriate. PROPOSE for the strategy change; the cleanup leak fix is AUTO.

**097 · Re-fetching everything on every navigation** `🟠` `🟡 PROPOSE`
`useEffect(fetchAllData, [])` in every page with no cache.
`DETECT:` full fetch in every route's effect · no React Query/SWR/TanStack cache · no `staleTime`.
`FIX:` Adopt a query/caching layer with sensible `staleTime`; dedupe and reuse. PROPOSE — it's an architecture addition.

**098 · No code splitting — one giant bundle** `🟠` `🟡 PROPOSE`
Landing + dashboard + admin all loaded on first visit.
`DETECT:` no dynamic imports in routes · single bundle output · no chunk splitting in config.
`FIX:` Route-level code splitting + vendor chunking via the bundler. PROPOSE; verify with a bundle analyzer. (This is the build-config side; 092 is the missing runtime `React.lazy`/`Suspense`.)

---

### CATEGORY 10 — Architecture Anti-Patterns

**099 · Hardcoded localhost URLs** `🟠` `🟢 AUTO` `⚙️ slopscore scan`
`fetch('http://localhost:3000/api')` in shipping code.
`DETECT:` `http://localhost` · `127.0.0.1` · `:3000/:8000/:8080` in source.
`FIX:` Move base URLs to env config (`process.env.API_URL` / framework env). AUTO — replace with the env read and add it to `.env.example`.

**100 · No 404 page** `🟡` `🟢 AUTO`
Unknown routes show a blank page or silently the home page.
`DETECT:` no `NotFound`/`404` route · no catch-all `*` · missing `not-found.tsx`.
`FIX:` Add a real 404 with a way back home/search. AUTO.

**101 · No error boundary — one crash kills the app** `🟠` `🟡 PROPOSE`
No `<ErrorBoundary>`; one throw unmounts the whole tree.
`DETECT:` no ErrorBoundary/`componentDidCatch` · no `error.tsx` (Next) · no top-level try/catch in async server components.
`FIX:` Add error boundaries around major subtrees + a route-level fallback that lets users recover (not a white screen, not a reload). PROPOSE — place boundaries where they make sense.

**102 · All business logic inside UI components** `🟠` `🟡 PROPOSE`
`fetch`, transforms, validation, and pricing rules all in the render component. No service layer.
`DETECT:` `fetch()` in component body · business rules inline in JSX · transforms mixed with render.
`FIX:` Extract data access into hooks/services and business rules into pure, testable functions; keep components for rendering. PROPOSE — it's a layering refactor; preserve behavior.

**103 · `z-index: 9999` everywhere** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
The biggest number the model can think of, scattered around with no system.
`DETECT:` `z-index: 9999/99999` · `z-[9999]` · 2+ elements over z-100.
`FIX:` Define a small z-index scale (dropdown/sticky/overlay/modal/toast) as tokens and map elements onto it. AUTO once the scale exists.

**104 · `!important` as a crutch** `🟠` `🟡 PROPOSE`
`!important` to bulldoze specificity instead of fixing it.
`DETECT:` `!important` 5+× · `!important` on non-a11y properties.
`FIX:` Resolve the specificity properly (selector structure, layer order, removing competing rules). Remove `!important`. PROPOSE — verify the cascade still renders correctly.

**105 · `window.location.reload()` as error recovery** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
The model's favorite handler: reload and hope.
`DETECT:` `location.reload()` in catch blocks/error handlers.
`FIX:` Replace with real recovery — retry the operation, reset the relevant state, or show an actionable error. PROPOSE.

**106 · `alert()`/`confirm()`/`prompt()` in production** `🟡` `🟡 PROPOSE` `⚙️ slopscore scan`
Native blocking dialogs instead of real components.
`DETECT:` `(alert|confirm|prompt)\(` in non-test source (exclude logger/wrapper utilities).
`FIX:` Replace with the app's toast/dialog/`<AlertDialog>` components. PROPOSE — confirm flow semantics (async confirm vs sync) are preserved.

**107 · `.env` committed to the repo** `🔴` `🔴 FLAG` `⚙️ slopscore scan`
Real keys/credentials tracked in version control.
`DETECT:` `git ls-files | grep '^\.env'` · `.env.local/.env.production` tracked · secrets in committed files.
`FIX:` Add to `.gitignore`, ship a `.env.example` with blank keys (AUTO-safe). **But FLAG: every secret in the committed file is compromised — instruct the human to rotate all of them and scrub history.** Don't claim it's fixed by gitignoring alone.

**108 · Three styling systems at once** `🟠` `🟡 PROPOSE`
Inline styles + CSS Modules + Tailwind, sometimes on one element.
`DETECT:` `style={{}}` alongside Tailwind `className` · CSS Module import + inline styles in one component.
`FIX:` Pick one styling approach for the project and migrate toward it. PROPOSE — it's a sweeping but high-value consolidation; do it incrementally.

**109 · Inconsistent file naming** `🟡` `🟡 PROPOSE`
`MyComponent.jsx` next to `mycomponent.js` next to `my-component.tsx`.
`DETECT:` the same logical kind of file (e.g. components) named with 2+ case conventions in one directory — not legitimate type conventions like `Component.tsx` next to `utils.ts`.
`FIX:` Choose one convention (e.g. PascalCase components, kebab-case routes) and rename to match, updating imports. PROPOSE — renames touch imports; use tooling.

**110 · No barrel exports / inconsistent import paths** `🟡` `🟡 PROPOSE`
`../../../ui/button` in one file, a different deep path in another.
`DETECT:` deep relative paths (`../../..`) · same module imported via different paths · no index barrels.
`FIX:` Set up path aliases (`@/components/...`) and/or barrels; normalize imports. PROPOSE.

---

### CATEGORY 11 — API / Backend Anti-Patterns

**111 · Destructive actions via GET** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`GET /api/delete-user?id=123`. GET must be safe/idempotent; this gets triggered by prefetchers, crawlers,
and `<img>` tags.
`DETECT:` `router\.get\(['"]/(delete|remove|destroy|purge)` · GET handlers named delete/remove/purge.
`FIX:` Move to POST/DELETE with proper method semantics; update the client. PROPOSE — coordinate client + server + any CSRF protection.

**112 · No input validation/sanitization on API routes** `🔴` `🟡 PROPOSE`
`req.body.email` trusted directly. The model assumes friendly input.
`DETECT:` `req.body.*` used directly · no zod/yup/joi validation · no input schema.
`FIX:` Validate every external input against a schema at the boundary; reject/normalize before use. PROPOSE — define the schema from the real contract.

**113 · Returning full DB objects to the frontend** `🔴` `🟡 PROPOSE`
Sending the whole user row — `password_hash`, `internal_flags`, `admin_level` — because no fields were
selected.
`DETECT:` `res.json(user)` of a full ORM row · no `.select()`/projection · password/hash/internal fields in response types.
`FIX:` Return explicit DTOs with only the fields the client needs; never serialize secrets/internal columns. PROPOSE; audit every endpoint's shape.

**114 · No auth check on protected routes** `🔴` `🟡 PROPOSE`
Handlers that should require a session/JWT but don't.
`DETECT:` protected handler with no `req.user` check · route with no auth middleware · admin endpoint with no role check.
`FIX:` Add authentication + authorization middleware; deny by default. PROPOSE — verify against the intended access model; this is a top source of AI-introduced CVEs.

**115 · No rate limiting** `🟠` `🟡 PROPOSE`
Unlimited requests per second; login endpoints accepting infinite password attempts.
`DETECT:` routes with no rate limiter · auth endpoints unthrottled.
`FIX:` Add rate limiting (express-rate-limit / framework equivalent), stricter on auth. PROPOSE.

**116 · All errors returned as HTTP 200** `🟠` `🟢 AUTO` `⚙️ slopscore scan`
`res.status(200).json({ error: "not found" })`. Breaks clients, caching, and monitoring.
`DETECT:` `status(200)…error` · `{ success:false, error }` on a 200 · no 4xx/5xx in error paths.
`FIX:` Return correct status codes (400/401/403/404/409/422/500). AUTO once the error taxonomy is clear; verify clients read status, not just body.

**117 · No retry logic for failed requests** `🟡` `🟡 PROPOSE`
Calls that fail silently — no retry, no backoff, no user notice.
`DETECT:` `fetch()` with no retry wrapper · network errors only `console.error`'d.
`FIX:` Add bounded retries with exponential backoff + jitter for idempotent calls; surface terminal failures to the user. PROPOSE — only retry what's safe to retry.

**118 · Circular dependencies** `🟠` `🟡 PROPOSE`
A↔B import cycles from files generated independently.
`DETECT:` bundler cycle warnings · ESLint `import/no-cycle` · `madge --circular`.
`FIX:` Break the cycle — extract the shared piece into a third module, or invert a dependency. PROPOSE.

---

### CATEGORY 12 — Testing Anti-Patterns

**119 · Happy-path-only tests** `🟠` `🟡 PROPOSE`
80% "coverage" that only exercises the success flow — no errors, edges, empties, or boundaries.
`DETECT:` test files with no error-path cases · no empty/null/undefined inputs · no failure scenarios.
`FIX:` Add tests for failure modes, empty states, boundaries, and the security-critical paths. PROPOSE — write them against the contract, not the implementation.

**120 · Brittle implementation-detail tests** `🟠` `🟡 PROPOSE`
Tests asserting internal call order/state instead of behavior; they break on any refactor.
`DETECT:` `toHaveBeenCalledWith` on internal helpers · mocking internal modules · tests that break on rename.
`FIX:` Rewrite to assert observable outputs/behavior; mock only true external boundaries. PROPOSE.

**121 · Coverage theater** `🟠` `🟡 PROPOSE`
High coverage numbers achieved by tests that call code without asserting outcomes.
`DETECT:` high coverage + zero negative cases · tests that invoke without asserting.
`FIX:` Add real assertions; gate on test *quality*, not just the coverage badge. PROPOSE. (Distinct from 119 (happy-path-only) and 149 (tautological asserts): the tell here is using the coverage *number itself* as the deliverable.)

**122 · No tests on auth / payment / data-handling** `🔴` `🟡 PROPOSE`
The riskiest paths have no tests, or only happy-path ones.
`DETECT:` auth handlers with no test file · payment functions untested · delete/export endpoints untested.
`FIX:` Prioritize tests here — success, failure, authorization, and abuse cases. PROPOSE; these are the tests that prevent the expensive incidents.

---

### CATEGORY 13 — Fake / Placeholder Features

> These are the patterns that make a vibe-coded app *look* done while doing nothing. Most are 🔴 because
> a button that lies to the user is worse than an honest "not built yet." Authority is usually FLAG or
> PROPOSE because the right fix (build it, hide it, or wire it) needs product intent.

**123 · Dashboard metrics showing 0 or hardcoded fakes** `🔴` `🔴 FLAG`
"Total Users: 0 / Revenue: $0," or numbers that never change.
`DETECT:` hardcoded `count={42}`/`revenue="$1,234"` · stats with no binding · metrics unaffected by actions.
`FIX:` Flag whether the data pipeline exists. If it does, bind it; if not, show an honest empty/loading state, not a fake number. Never fabricate metrics. FLAG.

**124 · Charts rendering hardcoded sample data** `🔴` `🔴 FLAG`
`const chartData = [{x:1,y:100},{x:2,y:150}]` that never reflects reality.
`DETECT:` hardcoded data arrays passed to recharts/chart.js/d3 · chart with no fetch.
`FIX:` Wire to real data with proper loading/empty/error states. If data doesn't exist yet, FLAG and show an empty state. Don't ship fake trend lines. (123 is fabricated stat tiles; this is fabricated chart *series* — same sin, different widget.)

**125 · Settings page where nothing saves** `🔴` `🟡 PROPOSE`
A form with a Save button whose `onSubmit` only `console.log`s or toasts — no persistence.
`DETECT:` settings `onSubmit` with no API call · `handleSave` that only logs/toasts · local-state-only with no persistence.
`FIX:` Wire to a real persistence endpoint and confirm it round-trips. PROPOSE — implement the save path and verify it actually stores and reloads.

**126 · Export button downloading an empty/broken file** `🟠` `🟡 PROPOSE`
"Download CSV/PDF" that yields an empty file, headers-only, or a silent error.
`DETECT:` export with no data binding · `downloadCSV([])` · blob from empty/placeholder data.
`FIX:` Generate the export from real data; handle empty data with a clear message; test the produced file opens correctly. PROPOSE. (Escalate to 🔴 if this is the user's only data-portability/GDPR export path.)

**127 · Search that doesn't filter** `🟠` `🟡 PROPOSE`
A search box whose state never filters the list, or whose API results are ignored.
`DETECT:` search `onChange` that doesn't update the list · search state unused in filtering · API results discarded.
`FIX:` Connect the query to the actual filtering/fetch and render the filtered results. PROPOSE.

**128 · Pagination that loads everything client-side** `🟠` `🟡 PROPOSE`
Real-looking controls that fetch all 5,000 rows and hide most in JS.
`DETECT:` `data.slice(page*size,…)` over the full set · no `limit/offset/cursor` params · full dataset passed to the pager.
`FIX:` Implement server-side pagination (limit/offset or cursor); fetch per page. PROPOSE.

**129 · Notification bell with a static unread count** `🟡` `🟡 PROPOSE`
`<Bell/><span>3</span>` where 3 is hardcoded and never changes; clicking shows nothing.
`DETECT:` notification count not from state/API · bell with no handler · `unreadCount = 3` constant.
`FIX:` Bind the count to real data and implement the panel — or remove the bell until it's real. PROPOSE.

**130 · Avatars always showing initials — photos never load** `🟡` `🟡 PROPOSE`
Initials-in-a-circle fallback with no actual image resolution or upload path.
`DETECT:` avatar always rendering initials · no `avatarUrl` field · no upload endpoint · hardcoded to ui-avatars/dicebear.
`FIX:` Decide honestly: if avatars are a real feature, wire `avatarUrl` + an upload path with initials as the genuine fallback; if they aren't, delete the dead image scaffolding and ship initials as the *intended* design. The slop isn't initials — it's half-built scaffolding for a feature that never arrives. PROPOSE.

---

### CATEGORY 14 — Security Anti-Patterns

**131 · No CSRF protection on state-changing endpoints** `🔴` `🟡 PROPOSE`
Mutations with no CSRF token verification.
`DETECT:` POST/PUT/DELETE without CSRF middleware · forms with no token · no csurf/helmet.
`FIX:` Add CSRF protection (token pattern or `SameSite` cookies + checks) on all mutations. PROPOSE — coordinate with the auth/cookie strategy.

**132 · Sensitive data in URL query params** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`/reset-password?token=secret`. Lands in logs, history, and Referer headers.
`DETECT:` `token=|secret=|key=` in URLs · auth flows passing credentials in query strings.
`FIX:` Move secrets to POST bodies/headers or short-lived single-use tokens not exposed in URLs. PROPOSE.

**133 · No Content-Security-Policy / security headers** `🟠` `🟡 PROPOSE`
No CSP, no `helmet()`, missing `X-Frame-Options`/`X-Content-Type-Options`.
`DETECT:` no helmet/CSP config · no security-header middleware · missing standard headers.
`FIX:` Add `helmet()` (or framework equivalent) with a real CSP, frame options, and HSTS. PROPOSE — CSP needs tuning to your asset origins so it doesn't break the app.

**134 · Stack traces exposed to users** `🔴` `🟢 AUTO` `⚙️ slopscore scan`
`res.json({ error: error.stack })` leaks file paths, line numbers, internals.
`DETECT:` `error.stack`/`err.stack` in responses · internal details sent to client · no NODE_ENV gate.
`FIX:` Return a generic message + an error id; log the full trace server-side only; gate any detail behind a dev-env check. AUTO.

---

### CATEGORY 15 — Miscellaneous & Structural Tells

**135 · "Send it up" architecture: everything in one `server.js`** `🟠` `🟡 PROPOSE`
A 600-line `server.js`/`app.py` holding routes, DB logic, business rules, middleware, and utilities.
`DETECT:` single server file > 400 lines · all routes+logic in one file · no route/controller/service split.
`FIX:` Split into routes → controllers → services → data layers. PROPOSE — incremental extraction, behavior-preserving, on a branch.

**136 · No loading skeleton — white flash before content** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
`if (loading) return null` → blank flash before content paints.
`DETECT:` `if (loading) return null` · loading state rendering empty.
`FIX:` Render a skeleton/spinner (or keep the previous content) during load. AUTO — add a basic skeleton matching the layout.

**137 · Staggered fade-ins on every element** `🟡` `🟡 PROPOSE`
Hero 0ms, subtitle 200ms, cards 400/600/800ms — a cascade that makes the page feel *slower* and draws
the eye to the loading sequence.
`DETECT:` staggered `animation-delay` across siblings · Framer `staggerChildren` on all page content · delays in 200/400/600/800 multiples.
`FIX:` Cut the choreography. Show content immediately; reserve subtle motion for genuine state changes; honor `prefers-reduced-motion`. PROPOSE.

**138 · Micro-animations on every interactive element** `🟡` `🟡 PROPOSE`
Everything bounces, spins, shakes, or scales on hover because it was asked to "feel alive."
`DETECT:` `@keyframes bounce/shake/pulse` on UI · rotate animations on non-loading icons · `hover:scale-105` on every card/button · animation on >30% of interactive els.
`FIX:` Keep motion purposeful and sparse (the primary CTA, real feedback). Remove the rest; respect reduced-motion. PROPOSE. (137 is the staggered *entrance* choreography; this is per-element hover/keyframe sprawl.)

**139 · `window.location.href` navigation in an SPA** `🟠` `🟢 AUTO` `⚙️ slopscore scan`
`window.location.href = '/dashboard'` instead of the router, forcing a full reload.
`DETECT:` `window.location.href =` / `window.location.replace(` for internal nav.
`FIX:` Use the router (`navigate()`/`<Link>`/`router.push()`). AUTO — keep `window.location` only for genuinely external URLs.

**140 · Copy-pasted Tailwind class strings (no component extraction)** `🟡` `🟡 PROPOSE`
The tell isn't a long class list — that's idiomatic Tailwind. It's the *same* long string copy-pasted
across files because the model never extracted a component.
`DETECT:` the same 15+ class `className` string repeated 3+ times across files with no shared component (a single long class string is normal — don't flag it).
`FIX:` Pull the repeated combo into a component (or `cva` variants); leave genuinely one-off utilities inline. Reach for a component before `@apply` — it's usually the better unit. PROPOSE.

---

### CATEGORY 16 — AI-Era Supply Chain & Agent Tells (new for 2026)

> These are the failure modes specific to *agentic* and *vibe-coded* development that older lint rules
> don't cover. They are the highest-leverage additions in this file — several map directly to confirmed
> 2026 incidents and CVEs.

**141 · Hallucinated / slopsquatted dependencies** `🔴` `🔴 FLAG`
A dependency the AI invented that doesn't exist — or worse, one an attacker pre-registered under the
name AI models commonly hallucinate ("slopsquatting"). ~20% of AI-generated code references non-existent
packages, and 43% of hallucinated names recur across re-prompts, making them reliably squattable.
Confirmed live cases include the malicious `unused-imports` (vs. the real `eslint-plugin-unused-imports`)
and the agent-spread phantom `react-codeshift`.
`DETECT:` deps in the manifest not imported anywhere · packages with near-miss names of popular ones · very low weekly downloads · recent publish date · no repo/author · `npm ls`/install errors. Cross-check Python imports against npm (8.7% of Python hallucinations exist on npm).
`FIX:` **Do not install on faith.** For each suspicious dep: verify it's the real, intended package (name, downloads, publisher, repo), or replace it with the legitimate one, or remove it. FLAG anything you can't verify and stop — an install can run a malicious post-install script. Enforce lockfile pinning + hash verification; gate AI-suggested installs behind human review or an allowlist.

**142 · Unpinned / hardcoded LLM model strings** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
`model: "gpt-4o"` (or whatever the AI happened to know) hardcoded in app code — unpinned, undated, and
not configurable. Breaks silently when the alias moves or is deprecated; can't be swapped per
environment.
`DETECT:` model name string literals in source · no env/config indirection · aliases the model "just knew."
`FIX:` Pin the exact, current model id, move it to config/env, and centralize the client. Confirm the id is real and available rather than a remembered/guessed one. PROPOSE.

**143 · Source maps / build artifacts shipped to production** `🔴` `🔴 FLAG` `⚙️ slopscore scan`
Production source maps (or other build artifacts) exposing original source. This is exactly how
Anthropic's own Claude Code CLI leaked ~512k lines of TypeScript via a 59.8 MB source map in a published
npm package in March 2026 — a packaging-config bug, not a code bug, and invisible to ordinary linters.
`DETECT:` `productionBrowserSourceMaps: true` / `sourceMap: true` in prod config · `.map` files in `dist`/published output · oversized published package · missing `files`/`.npmignore` allowlist.
`FIX:` Disable prod source maps (or upload them privately to your error tracker, never publish them). Add an explicit `files` allowlist in `package.json` and verify the packed tarball (`npm pack --dry-run`) contains only what you intend. FLAG — verify what already shipped and whether it must be unpublished.

**144 · Command injection in CI / non-interactive agent mode** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
Unsanitized input flowing into shell execution, especially in CI or when an agent runs non-interactively
(no human to catch the prompt). A documented, exploitable class in agentic CI/CD pipelines.
`DETECT:` `exec`/`spawn`/`system`/backtick shell with interpolated input · unquoted vars in shell steps · agent steps that run arbitrary generated commands without review.
`FIX:` Avoid the shell where possible (use APIs/`execFile` with arg arrays, never string concatenation). Sanitize and quote all inputs; constrain agent command execution behind an allowlist + approval. PROPOSE; treat any user/remote-controlled path as 🔴.

**145 · Silent architectural drift across AI-generated changes** `🟠` `🟡 PROPOSE`
No single PR is wrong, but each AI change nudges the codebase away from its intended design until "how
it was designed" and "how it works" diverge into a chasm. The most expensive slop because it's invisible
per-commit and exponentially harder to undo later.
`DETECT:` the same concept implemented three different ways across modules · new patterns that contradict existing conventions · rising duplication + churn together · features that don't follow the established layering.
`FIX:` Establish/locate the project's conventions (an `ARCHITECTURE.md` or the dominant existing pattern) and refactor outliers toward it; document the intended structure so future changes anchor to it. PROPOSE — this is judgment work; surface the drift clearly and propose a consolidation plan rather than rewriting everything at once.

**146 · Over-defensive / belt-and-suspenders boilerplate** `🟡` `🟡 PROPOSE`
Redundant null checks, try/catch around code that can't throw, re-validation of already-validated data,
defensive fallbacks for impossible states — the model hedging because it doesn't trust the surrounding
code it can't see.
`DETECT:` nested guard clauses for impossible inputs · try/catch around pure synchronous logic · the same value validated at every layer · `?.` chains where the value is guaranteed.
`FIX:` Validate once at the boundary; trust internal invariants; remove guards for states that can't occur. Keep genuine edge handling. PROPOSE.

**147 · Mixed concerns: UI + data access in one file** `🟠` `🟡 PROPOSE`
A file that both renders UI *and* talks directly to the database/external service — flagged specifically
by AI-code linters because models complete a task in one place rather than across layers.
`DETECT:` DB client/SQL in the same file as JSX/templates · direct external-service calls inside view components.
`FIX:` Separate the data layer from the view (see 102/135). PROPOSE.

**148 · Unchecked results from external/DB calls** `🟠` `🟡 PROPOSE`
Using a query/fetch result as if it always succeeded and is always shaped as expected — no null check,
no status check, no empty-result handling.
`DETECT:` accessing `result.rows[0].x` with no existence check · `await fetch()` used without checking `.ok` · array `[0]` access with no length check.
`FIX:` Check for failure, null, and empty before use; handle each path. PROPOSE.

**149 · Trivial / tautological test assertions** `🟠` `🟢 AUTO` `⚙️ slopscore scan`
`expect(true).toBe(true)`, `expect(result).toBeDefined()` as the entire test, or over-mocking that
asserts the mock, not the code.
`DETECT:` `expect(true).toBe(true)` · assertions that can't fail · tests where every dependency is mocked.
`FIX:` Replace with assertions on real behavior/outputs, or delete the empty test and write a real one. AUTO to remove tautologies; PROPOSE to author the replacement.

**150 · No SBOM / provenance for an AI-built project** `🟡` `🟡 PROPOSE`
A project largely AI-generated with no dependency inventory, no lockfile discipline, and no record of
what's actually in the build — the foundation slopsquatting and CVE-surge mitigations depend on.
`DETECT:` no committed lockfile · no SBOM · `npm audit`/`osv-scanner` never run · CI with no dependency or secret scanning.
`FIX:` Commit lockfiles, add `npm audit`/`pip-audit`/`osv-scanner` + gitleaks to CI, and generate an SBOM. PROPOSE — set up the guardrails so the next AI change can't quietly introduce risk.

---

### CATEGORY 17 — Language-Specific Anti-Patterns

The catalog so far is web/JS-shaped because that's where vibe-coded slop concentrates. These are the
language-specific tells AI generators reach for in other ecosystems. (Python today; Go and Rust follow.)

**151 · Mutable default argument (Python)** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
`def f(items=[])` / `def f(opts={})`. The default object is created once and *shared across every call* —
a classic footgun AI reproduces constantly.
`DETECT:` `def …(… = [` / `def …(… = {` — a parameter defaulting to a list/dict/set literal.
`FIX:` Default to `None` and build the collection inside the function (`if items is None: items = []`). AUTO is unsafe (changes behavior); PROPOSE.

**152 · `== None` instead of `is None` (Python)** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
`x == None` / `x != None`. `None` is a singleton; identity is correct, `==` can be overridden and is slower.
`DETECT:` `== None` · `!= None`.
`FIX:` Use `is None` / `is not None`. Mechanical and safe — AUTO.

**153 · `eval()` / `exec()` on dynamic input (Python)** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`eval(user_input)` / `exec(payload)` — arbitrary code execution from data.
`DETECT:` `eval(` / `exec(` not preceded by `.` (the builtins), excluding `ast.literal_eval`.
`FIX:` Use `ast.literal_eval` for literals, a real parser for expressions, or a dispatch dict — never `eval`/`exec` on input.

**154 · SQL injection via f-string (Python)** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`cursor.execute(f"SELECT * FROM users WHERE id={uid}")` — the f-string interpolates input straight into SQL.
`DETECT:` an f-string containing `SELECT…FROM` / `INSERT INTO` / `UPDATE…SET` / `DELETE FROM` with a `{` interpolation.
`FIX:` Parameterize: `cursor.execute("… WHERE id = %s", (uid,))`. Never f-string user input into SQL.

**155 · Command injection via `os.system` / `shell=True` (Python)** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`os.system(f"rm {path}")` / `subprocess.run(cmd, shell=True)` with interpolated input.
`DETECT:` `os.system(` with an f-string/`%`/`+` · `subprocess.*(… shell=True …)`.
`FIX:` Use `subprocess.run([...], shell=False)` with an args list; validate inputs. Never build a shell string from data.

**156 · Empty `interface{}` overuse (Go)** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
`interface{}` (Go's untyped escape hatch) where a concrete type or generic belongs — discards type safety.
`DETECT:` `interface{}` in signatures/fields/maps where the shape is actually known.
`FIX:` Use a concrete type or a Go 1.18+ type parameter. Reserve `any`/`interface{}` for genuinely heterogeneous data.

**157 · Ignored error return (Go)** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
`val, _ := doThing()` — the error is discarded into `_`, so a real failure passes silently.
`DETECT:` `, _ :=` / `, _ =` from a function call (excluding `range` and the comma-ok of maps/type assertions).
`FIX:` Handle the error — check it, wrap it with context, or return it. Don't blank a function's error.

**158 · `fmt.Print` debugging (Go)** `🟡` `🟢 AUTO` `⚙️ slopscore scan`
`fmt.Println(...)` left in library/production code as debug output.
`DETECT:` `fmt.Print` / `fmt.Println` / `fmt.Printf` in non-test code.
`FIX:` Remove it, or route through `log`/a structured logger with levels. AUTO.

**159 · Command injection via `exec` + `sh -c` (Go)** `🔴` `🟡 PROPOSE` `⚙️ slopscore scan`
`exec.Command("sh", "-c", "rm "+path)` — input built into a shell string.
`DETECT:` `exec.Command("sh"|"bash"|"cmd", "-c", …)`.
`FIX:` Call the program directly: `exec.Command(prog, arg1, arg2)`. Never assemble a shell command from data.

**160 · `.unwrap()` / `.expect()` (Rust)** `🟠` `🟡 PROPOSE` `⚙️ slopscore scan`
The canonical Rust AI tell: `.unwrap()`/`.expect()` everywhere, turning every `Result`/`Option` into a panic.
`DETECT:` `.unwrap()` · `.expect(` in non-test code.
`FIX:` Propagate with `?`, `match`, `.unwrap_or`/`.unwrap_or_else`, or `.ok_or` — handle the error path, don't panic.

**161 · `todo!()` / `unimplemented!()` / `panic!()` (Rust)** `🟠` `🔴 FLAG` `⚙️ slopscore scan`
`todo!()`/`unimplemented!()` are unbuilt paths that panic at runtime; `panic!()` in a library aborts the caller.
`DETECT:` `todo!(` · `unimplemented!(` · `unreachable!(` · `panic!(`.
`FIX:` Finish the path or flag the gap; replace `panic!` with a returned `Result`/`Error`. FLAG — a `todo!` may be a known, intentional stub.

**162 · `unsafe` block (Rust)** `🟠` `🔴 FLAG` `⚙️ slopscore scan`
An `unsafe { … }` block — sometimes necessary, often AI reaching for it to silence the borrow checker.
`DETECT:` `unsafe {`.
`FIX:` Justify each block with a comment proving the invariants it upholds, or replace it with safe code. FLAG for human review.

---

## §4 · SCORING & THE REPORT

After scanning, fill in this report verbatim and hand it to the human. It is the deliverable.

```markdown
# 🩺 SYSTEM CHECK — <project name>

**Context:** <one line: language, framework, ships-UI?, has-backend?, audience>
**Scanned:** <dirs> · <N files> · <N kLOC> · <date>
**Tools run:** <vibecop / semgrep / gitleaks / eslint / axe / grep ...>

## Slop Score
| | 🔴 Critical | 🟠 Major | 🟡 Minor | Weighted | Density (/kLOC) | Verdict |
|--------|:--:|:--:|:--:|:--:|:--:|:--|
| Before | 0 | 0 | 0 | 0 | 0.0 | <verdict> |
| After  | 0 | 0 | 0 | 0 | 0.0 | <verdict> |

## ✅ Fixed (AUTO) — applied on branch `anti-slop/<date>`
- [ID] <pattern> — <file:line> — <what changed> (commit <sha>)

## 🟡 Proposed (PROPOSE) — on the branch, awaiting your review
- [ID] <pattern> — <file:line> — <the change + why> — accept / revert?

## 🔴 Flagged (FLAG) — needs your decision or an out-of-band action
- [ID] <pattern> — <file:line> — <what it is + the action only you can take, e.g. "rotate this key">

## 🧭 Escape-Move check (the pristine bar — §5)
- [ ] Palette has a point of view (not lavender→indigo)
- [ ] Typeface is a deliberate choice (not default Inter), with heading/body contrast
- [ ] One strong layout primitive, repeated — not seven card types

## Verification
- build: <pass/fail> · typecheck: <pass/fail> · tests: <pass/fail> · a11y (axe): <pass/fail>

**Next:** <run the loop again / done — score is 0 on 🔴🟠 and escape moves pass>
```

**Scoring reminders:** weighted = 🔴×10 + 🟠×3 + 🟡×1; density = weighted ÷ kLOC. Drive 🔴 and 🟠 to
zero first; remaining 🟡 must be *deliberate*, not residual. "Pristine" = 0 on 🔴🟠, defensible 🟡,
and all three escape moves satisfied.

---

## §5 · THE THREE MOVES THAT ESCAPE SLOP

Removing tells gets you to "clean." These three get you to "has a point of view" — the difference
between the 46% clean and the work that looks authored. From Krebs' research and the clean cohort:

1. **Pick a palette that is not the LLM default.** Warm earth tones; high-contrast black + one bright;
   cream-and-pink; anything with an opinion. Explicitly *not* lavender-to-indigo. Define it as tokens
   so it's enforced, not sprinkled.

2. **Pick a typeface that is not Inter — and pair it.** Geist, Söhne, Untitled Sans, Tiempos, Migra,
   Inktrap, a real grotesk. Pair a display face with a distinct body face; the contrast wakes the page
   up. Set a deliberate type scale.

3. **Commit to one strong layout primitive and repeat it.** Not seven card types and four section
   styles. One primitive, repeated until it becomes the product's visual signature.

These are the positive counterpart to the deny-list: when the agent has driven the score to zero, check
these three before declaring the system pristine.

---

## §6 · QUICK-REFERENCE SCOREBOARD

The 16 measurable DOM/CSS tells from Krebs' Playwright audit of 1,590 Show HN pages — the fastest
visual triage. 22% of pages scored 4+ (heavy), 32% scored 2–3 (mild), 46% scored 0–1 (clean).

| # | Pattern | Catalog ID | Prevalence |
|---|---------|:----------:|------------|
| 1 | Inter as sole typeface | 021 | Most common |
| 2 | Space Grotesk + Instrument Serif combo | 022 | Very common |
| 3 | Serif italic accent word in sans hero | 023 | Common |
| 4 | "VibeCode Purple" accent | 001 | #1 color tell |
| 5 | Permanent dark mode, no light option | 005 | 34% of pages |
| 6 | Failing body-text contrast in dark themes | 086 | Very common |
| 7 | Gradient backgrounds | 004 | 27% of pages |
| 8 | Large colored glows / shadows | 007 | Common |
| 9 | Centered hero in generic sans | 026 | Very common |
| 10 | Badge directly above H1 | 009 | 18% of pages |
| 11 | Colored left/top card border | 012 | Strong tell |
| 12 | Identical icon-on-top feature cards | 011 | 22% of pages |
| 13 | Numbered 1-2-3 step section | 015 | 17% of pages |
| 14 | Stat banner with hardcoded numbers | 016 | Common |
| 15 | Emoji nav icons | 017 | Common |
| 16 | ALL-CAPS headings/labels | 018 | Common |

**Visual triage:** 0–1 tells = clean · 2–3 = mild slop · 4+ = heavy slop.

---

## §7 · CI INTEGRATION — keep it from coming back

De-slopping once is a moment; keeping the score at zero is a process. Wire the scanner into the loop so
the next AI change can't quietly reintroduce slop.

```yaml
# .github/workflows/anti-slop.yml (sketch)
name: anti-slop
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx vibecop scan . --format agent        # AST detectors, PR comments
      - run: npx gitleaks detect --source . --no-banner # secrets
      - run: npm audit --audit-level=high              # known CVEs
      - run: npx knip                                   # unused deps/exports
      - run: npx tsc --noEmit && npx eslint .           # types + lint
      # add: semgrep --config auto . · osv-scanner -r . · pa11y for UI routes
```

- Install always-on agent hooks so the assistant polices itself as it writes:
  `npx vibecop init` (supports Claude Code, Cursor, Codex CLI, Aider, Copilot, Windsurf, Cline).
- Configure thresholds in `.vibecop.yml`; gate PRs at `severity: warning` to start, tighten over time.
- Add a `CONTRIBUTING.md` line: *"Run the Anti-Slop Protocol before opening a PR; Slop Score must be 0
  on 🔴 and 🟠."*

---

## §8 · SOURCES & GROUNDING

The statistics and incident references in this file are drawn from public 2025–2026 research and
reporting. Verify current figures before quoting them externally:

- **Adrian Krebs**, "Scoring Show HN submissions for AI design patterns" — Playwright audit of 1,590
  Show HN landing pages; the 16-tell scoreboard; 22%/32%/46% heavy/mild/clean split.
- **Nielsen Norman Group** (2025) — research on the sparkles icon and "sparkle ambiguity."
- **GitClear**, *AI Copilot Code Quality 2025* — 211M lines analyzed: duplicated blocks up 4–8×,
  moved/refactored lines down from ~25% (2021) to <10% (2024), churn 5.5%→7.9%, copy/paste first
  exceeding refactoring in 2024.
- **CodeRabbit** — ~1.7× more issues in AI-generated PRs.
- **Veracode**, *2025 GenAI Code Security Report* — 80 curated tasks across 100+ LLMs (Java, JavaScript,
  Python, C#): **45% of generated code introduced a security vulnerability**; AI code ~2.74× more likely
  to introduce XSS; Java the riskiest at a 72% failure rate.
- **Larridin**, *AI Slop Index* — five detection signals: duplication ratio, 30/90-day revert rates,
  complexity-adjusted analysis, architectural coherence, test-behavior coverage.
- **GitHub / Stack Overflow / Pragmatic Engineer 2026 surveys** — 92% daily AI-tool use, 46% of new
  code AI-generated, trust 77%→60%.
- **vibecop** (bhvbhushan/vibecop) — 35 AST detectors for AI code; field density ~4.4/kLOC (established)
  vs ~14.0/kLOC (vibe-coded); agent hooks across 7 assistants.
- **Cloud Security Alliance** & **Georgia Tech Vibe Security Radar** (2026) — slopsquatting research
  (hallucination rates ~21.7% open / ~5.2% commercial; 43% recurrence; the `unused-imports` and
  `react-codeshift` incidents); dozens of AI-traceable CVEs catalogued per month.
- **VibeGuard** (arXiv, 2026) & reporting on the **Claude Code source-map leak** (Mar 2026) — ~512k LOC
  exposed via a 59.8 MB published source map; the packaging-config failure class.
- **The Fountain Institute**, **AquilaX**, **CSS-Tricks**, **ShapeofAI.com**, and the
  `vibecoded-design-tells` corpus — supporting visual/iconography analysis.

---

> **Remember the one rule that makes this safe:** the tool revealed how little structure was there to
> begin with. Your job is to add the structure back — fix what you may, propose what needs taste, flag
> what needs a human — and leave the system more coherent than you found it. Then run it again.
