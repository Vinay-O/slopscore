'use strict';

const fs = require('fs');
const path = require('path');
const { LINE_RULES, WHOLE_FILE_RULES, META_RULES } = require('./rules');

const out = (s) => process.stdout.write(s + '\n');

const ACTION_YML = `name: anti-slop
on: [pull_request, push]
jobs:
  slopscore:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: Scan for AI slop
        run: npx slopscore scan . --fail-on major
`;

const CONFIG_JSON = `{
  "ignore": ["examples", "fixtures"],
  "failOn": "major"
}
`;

// A self-contained agent directive. Any coding agent that reads AGENTS.md /
// CLAUDE.md (Cursor, Codex, Claude Code, Aider, Windsurf, Cline…) auto-adopts the
// protocol — no need to tell it "use slopscore" by hand each session.
const AGENTS_MARKER = '<!-- slopscore:anti-slop -->';
function agentsSection() {
  const n = LINE_RULES.concat(WHOLE_FILE_RULES, META_RULES).length;
  return `${AGENTS_MARKER}
## Anti-Slop Protocol (slopscore)

This repository is guarded by [slopscore](https://github.com/Vinay-O/slopscore) — a
catalog of 180+ AI-slop patterns, ${n} of them auto-checked. Before you finish ANY task:

1. Load the full catalog once per session: \`npx slopscore protocol\` — it lists every
   pattern with a DETECT, a FIX, and a fix authority (🟢 auto · 🟡 propose · 🔴 flag).
   Follow it. The untagged patterns (architecture, fake features, most design tells) are
   yours to apply by reading the code; the ⚙️-tagged ones the scanner checks for you.
2. Before declaring done, scan in **agent mode** — it's built for you:
   \`npx slopscore scan . --format agent --fail-on major\`. Each line is
   \`SEV [id] file:line title | zone= | confidence= | authority= | fix: …\`, compact
   enough to keep in context, and it ends with a NEXT: directive. Drive production
   critical + major findings to **0**. Auto-fix the safe ones with \`npx slopscore fix .\`.
3. Don't add new slop: no purple gradients, no \`console.log\`, no \`any\`, no fake stats,
   no \`eval\`, no disabled TLS, no god files. When in doubt, run the scan.

**Always prefer \`--format agent\`** over the human terminal output — it is denser,
machine-readable, and tells you exactly what you may auto-fix vs propose vs flag.
${AGENTS_MARKER}
`;
}

function writeIfAbsent(file, contents) {
  if (fs.existsSync(file)) { out(`  skip  ${file} (already exists)`); return; }
  fs.writeFileSync(file, contents);
  out(`  wrote ${file}`);
}

function ensureAgentsFile(file) {
  const section = agentsSection();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `# Agent Instructions\n\n${section}`);
    out(`  wrote ${file}`);
    return;
  }
  const existing = fs.readFileSync(file, 'utf8');
  if (existing.includes(AGENTS_MARKER)) { out(`  skip  ${file} (already has the slopscore section)`); return; }
  fs.writeFileSync(file, `${existing.replace(/\s*$/, '')}\n\n${section}`);
  out(`  updated ${file} (appended the slopscore section)`);
}

function runInit() {
  writeIfAbsent('.slopscore.json', CONFIG_JSON);
  const dir = path.join('.github', 'workflows');
  fs.mkdirSync(dir, { recursive: true });
  writeIfAbsent(path.join(dir, 'anti-slop.yml'), ACTION_YML);
  // Teach the repo's agents to use the protocol automatically. AGENTS.md is the
  // cross-tool standard; also extend CLAUDE.md if the repo already has one.
  ensureAgentsFile('AGENTS.md');
  if (fs.existsSync('CLAUDE.md')) ensureAgentsFile('CLAUDE.md');
  out('slopscore initialized. Commit .slopscore.json, the workflow, and AGENTS.md so every PR — and every agent — follows the protocol.');
}

module.exports = { runInit, agentsSection, AGENTS_MARKER, ACTION_YML, CONFIG_JSON };
