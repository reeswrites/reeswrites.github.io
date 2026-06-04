"use strict";

/**
 * Shared exercise-name normalization for lifting pages.
 *
 * Exposes a single global: LiftNormalize.normalize(name)
 * Returns { key, display, isUnilateralName }.
 *
 * ALIAS_MAP is hand-editable to merge variants the auto-normalizer misses.
 * Keys must already be normalized (lowercase, de-pluraled, no laterality prefix).
 * Example:
 *   LiftNormalize.ALIAS_MAP["cb lateral raise"] = "lateral raise";
 */
const LiftNormalize = (() => {
  "use strict";

  // Hand-editable alias map: normalized-key → canonical-key.
  const ALIAS_MAP = {
    // add overrides here
  };

  const LATERALITY_TOKENS = new Set(["u", "b", "uni", "unilateral", "bilateral"]);

  // Word-level typo fixes, depluralization, and abbreviation expansions.
  // CB = cable, BB = barbell, M = machine, DB = dumbbell, EZ = EZ bar
  // BTB = behind the back, ISO = isometric, RDL = Romanian deadlift
  const WORD_FIX = {
    // Equipment abbreviation expansions
    "cb":         "cable",
    "bb":         "barbell",
    "m":          "machine",
    "db":         "dumbbell",
    "ez":         "ez bar",
    // Positional / style abbreviations
    "btb":        "behind the back",
    "iso":        "isometric",
    "fr":         "free weight",
    "rdl":        "romanian deadlift",
    // Typo fixes
    "dumbell":    "dumbbell",
    // Depluralization
    "curls":      "curl",
    "raises":     "raise",
    "extensions": "extension",
    "rows":       "row",
    "flys":       "fly",
    "flies":      "fly",
    "pushdowns":  "pushdown",
    "shrugs":     "shrug",
    "presses":    "press",
    "stretches":  "stretch",
    "twists":     "twist",
    "pulldowns":  "pulldown",
    "pullups":    "pullup",
    "pushups":    "pushup",
    "squats":     "squat",
    "deadlifts":  "deadlift",
  };

  /**
   * Normalize an exercise name to a stable key + display string.
   * Also returns whether the name's leading token indicated unilateral.
   * @param {string} name
   * @returns {{ key: string, display: string, isUnilateralName: boolean }}
   */
  function normalize(name) {
    let s = name.trim().replace(/\s+/g, " ");

    // Strip leading laterality token; record if it marks unilateral.
    const words = s.split(" ");
    let isUnilateralName = false;
    if (LATERALITY_TOKENS.has(words[0].toLowerCase())) {
      const tok = words[0].toLowerCase();
      isUnilateralName = (tok === "u" || tok === "uni" || tok === "unilateral");
      s = words.slice(1).join(" ");
    }

    // Lowercase then apply word-level fixes.
    s = s.toLowerCase()
         .split(" ")
         .map((w) => WORD_FIX[w] ?? w)
         .join(" ");

    // Apply optional alias map override.
    const key = ALIAS_MAP[s] ?? s;

    // Title-case for display.
    const display = key
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    return { key, display, isUnilateralName };
  }

  return { normalize, ALIAS_MAP };
})();
