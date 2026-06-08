"use strict";

/**
 * localStorage persistence for custom insight widget layouts.
 *
 * Key: `insights:<page>:v1`
 * All ops are try/catch-wrapped → degrades to in-memory on quota / private mode.
 *
 * Layout schema:
 *   { version:1, rows:[{ cols:[{ id, type, title, config, colWidth }] }] }
 */
const InsightsStore = (() => {
  "use strict";

  const VERSION = 1;

  function _key(page) {
    return `insights:${page}:v1`;
  }

  function defaultLayout() {
    return { version: VERSION, rows: [] };
  }

  function load(page) {
    try {
      const raw = localStorage.getItem(_key(page));
      if (!raw) return defaultLayout();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION) return defaultLayout();
      return parsed;
    } catch {
      return defaultLayout();
    }
  }

  function save(page, layout) {
    try {
      localStorage.setItem(_key(page), JSON.stringify(layout));
    } catch {}
  }

  function clear(page) {
    try {
      localStorage.removeItem(_key(page));
    } catch {}
  }

  return { load, save, clear, defaultLayout };
})();
