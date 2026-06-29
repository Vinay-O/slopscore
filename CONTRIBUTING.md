# Contributing to slopscore

slopscore only gets better as the community catalogs more slop. The most valuable
contributions are **new detectors** and **false-positive fixes** — both are small,
self-contained, and reviewed fast.

## Setup

```bash
git clone https://github.com/Vinay-O/slopscore && cd slopscore
npm test            # 40 tests, zero dependencies — nothing to install
npm run demo        # scan the deliberately sloppy fixture
npm run selfcheck   # prove the repo still passes its own audit
```

There are **no dependencies** and there will never be any. slopscore is built entirely
on Node built-ins. A PR that adds a dependency will be asked to remove it.

## Add a detector in 2 minutes

Every detector is one object in [`src/rules.js`](src/rules.js). Add yours to `LINE_RULES`
(matched per line) or `WHOLE_FILE_RULES` (matched against the full file text, for
multi-line patterns like empty catch blocks).

```js
{
  id: '047',                       // the matching ID in ANTI_SLOP_PROTOCOL.md
  title: '"Click here" link text',
  category: 'copy',                // security|code|supply-chain|a11y|visual|copy|architecture|api
  severity: 'minor',              // critical | major | minor
  authority: 'auto',              // auto | propose | flag
  exts: MARKUP,                    // CODE | STYLE | MARKUP | TS | null (= all source)
  skipTests: true,                 // ignore *.test/spec/stories files
  respectComments: false,          // skip matches that fall inside // or /* */
  unlessFile: /\.d\.ts$/,         // optional: skip files whose path matches
  unless: /role="button"/,        // optional: suppress if this also matches the line
  re: />\s*(click here|tap here)\s*</i,
  fix: 'Rewrite link text to name the destination.',
}
```

### Rules of thumb

- **Map every detector to a catalog ID** in `ANTI_SLOP_PROTOCOL.md`. If the pattern
  isn't in the catalog yet, add it there first (keep the two in sync).
- **Tune for low false positives.** A noisy detector trains people to ignore the tool.
  Use `respectComments`, `skipTests`, `unless`, and `unlessFile` liberally.
- **Pick severity honestly.** 🔴 critical = breaks or endangers users (secrets, injection,
  broken features). 🟠 major = rots maintainability/UX. 🟡 minor = aesthetic tell.
- **Pick authority honestly.** 🟢 auto = mechanical and reversible. 🟡 propose = needs
  taste/architecture judgment. 🔴 flag = needs a human decision or an out-of-band action.

## Always add a test

Add a case to [`test/scanner.test.js`](test/scanner.test.js) — both a **positive** (the
pattern is caught) and, where false positives are plausible, a **negative** (a legitimate
line is *not* caught).

```js
test('detects my new pattern', () => {
  const p = tmpFile('a.jsx', '<a>Click here</a>\n');
  assert.ok(ids(scan(p)).includes('047'));
});
```

Then run `npm test` and `npm run selfcheck`. Both must be green before you open a PR.

## PR checklist

- [ ] `npm test` passes (and you added a test for your change)
- [ ] `npm run selfcheck` is still "Pristine" (exit 0)
- [ ] New detector is mapped to a catalog ID in `ANTI_SLOP_PROTOCOL.md`
- [ ] No new dependencies
- [ ] `CHANGELOG.md` updated under the unreleased section

## Ideas that need help

- More language coverage for the security/copy detectors (Python, Go, Rust).
- A `--fix` mode that applies the `auto`-authority fixes automatically.
- An `asciinema` cast for the README demo.
- Editor integrations (VS Code problem matcher, pre-commit hook).

Thanks for keeping the slop out. 🩺
