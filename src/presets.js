'use strict';

const { LINE_RULES, WHOLE_FILE_RULES, META_RULES } = require('./rules');

const ALL = LINE_RULES.concat(WHOLE_FILE_RULES, META_RULES);

// Build a rule-config fragment ({ id: false, … }) that disables whole categories
// or specific ids. Presets are just a named bundle of the same per-rule config a
// user can write in .slopscore.json — so the user's explicit config always wins.
function disableCategories(cats) {
  const out = {};
  for (const r of ALL) if (cats.includes(r.category)) out[r.id] = false;
  return out;
}
function disableIds(ids) {
  const out = {};
  for (const id of ids) out[id] = false;
  return out;
}

// No UI surface → the visual / copy / a11y categories are pure noise.
const NO_UI = disableCategories(['visual', 'copy', 'a11y']);

const PRESETS = {
  // Project-type presets — these do the real tuning.
  web: { rules: {} }, // a styled web app: everything on (the default)
  marketing: { rules: {} }, // a landing page: all the visual/copy tells matter
  library: { rules: NO_UI }, // a package with no UI
  backend: { rules: NO_UI }, // an API / service with no UI
  cli: { rules: { ...NO_UI, ...disableIds(['052', '178', '180']) } }, // stdout IS the product

  // Styling-framework aliases. slopscore's visual detectors are framework-agnostic
  // (they match Tailwind classes AND CSS-in-JS / MUI sx / styled / emotion alike),
  // so naming your framework confirms "web UI, all checks on" — kept so `--preset mui`
  // is a valid, documented choice.
  mui: { rules: {} },
  chakra: { rules: {} },
  mantine: { rules: {} },
  emotion: { rules: {} },
  tailwind: { rules: {} },
  'styled-components': { rules: {} },
  'vanilla-extract': { rules: {} },
};

const presetNames = () => Object.keys(PRESETS);

// Returns the preset's { rules } fragment, or null if the name is unknown.
function resolvePreset(name) {
  if (!name) return null;
  const p = PRESETS[String(name).toLowerCase()];
  return p ? { rules: p.rules || {} } : null;
}

module.exports = { resolvePreset, presetNames };
