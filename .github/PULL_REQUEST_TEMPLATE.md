<!-- Thanks for keeping the slop out. Keep PRs small and focused. -->

## What this changes

<!-- One or two sentences. If it adds a detector, name the pattern and catalog ID. -->

## Checklist

- [ ] `npm test` passes, and I added a test for this change (positive + negative where a false positive is plausible)
- [ ] `npm run selfcheck` is still **Pristine** (exit 0) — slopscore must pass its own scan
- [ ] New detector maps to a catalog ID in `ANTI_SLOP_PROTOCOL.md`
- [ ] No new dependencies (slopscore is zero-dependency, forever)
- [ ] `CHANGELOG.md` updated

## False-positive consideration

<!-- For a new/changed detector: where could this fire on legitimate code, and how did you guard against it? -->
