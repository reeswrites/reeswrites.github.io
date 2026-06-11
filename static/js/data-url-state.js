"use strict";

/**
 * Shared URL-state module for data pages.
 *
 * Handles:
 *   - Core read/write helpers for URLSearchParams + history.replaceState
 *   - Tab sync: reads/writes ?tab=<name> and activates Bootstrap tabs on load
 *
 * InsightsDashboard calls DataUrlState.getParams() / setParam() directly to
 * manage its own range, from, and to params.
 *
 * Backward compat: old hash links (#table, #insights, etc.) are silently
 * redirected to the query-param form on load.
 */
const DataUrlState = (() => {
  "use strict";

  // ── Core URL param helpers ────────────────────────────────────────────────

  function getParams() {
    return new URLSearchParams(window.location.search);
  }

  function setParam(key, value) {
    const params = getParams();
    if (value == null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const search = params.toString();
    history.replaceState(
      null,
      "",
      window.location.pathname + (search ? "?" + search : "") + window.location.hash,
    );
  }

  function deleteParam(key) {
    setParam(key, null);
  }

  // ── Tab sync ──────────────────────────────────────────────────────────────

  function initTabSync() {
    const tabButtons = Array.from(document.querySelectorAll("#myTab button[data-bs-toggle='tab']"));
    if (!tabButtons.length) return;

    // Map short name → button element ("insights" → <button id="insights-tab">)
    const nameToBtn = {};
    tabButtons.forEach((btn) => {
      nameToBtn[btn.id.replace(/-tab$/, "")] = btn;
    });

    // Write ?tab=<name> (+ resize) whenever a tab becomes active
    tabButtons.forEach((btn) => {
      btn.addEventListener("shown.bs.tab", () => {
        setParam("tab", btn.id.replace(/-tab$/, ""));
        window.dispatchEvent(new Event("resize"));
      });
    });

    function activateFromURL() {
      const params = getParams();
      let tabName = params.get("tab");

      // Backward compat: #table / #insights / #table-tab-pane → ?tab=table
      if (!tabName && window.location.hash) {
        const raw = window.location.hash.slice(1);
        tabName = raw.replace(/-tab-pane$/, "").replace(/-tab$/, "");
        // Clear the hash now that we've read it
        if (tabName && nameToBtn[tabName]) {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }

      if (tabName && nameToBtn[tabName]) {
        nameToBtn[tabName].click();
      } else {
        // No tab param: write the currently-active tab into the URL
        const activeBtn = document.querySelector("#myTab .nav-link.active");
        if (activeBtn) setParam("tab", activeBtn.id.replace(/-tab$/, ""));
      }
    }

    // Safe ready helper — fires immediately if DOM is already parsed
    if (document.readyState !== "loading") {
      activateFromURL();
    } else {
      document.addEventListener("DOMContentLoaded", activateFromURL);
    }

    window.addEventListener("popstate", activateFromURL);
  }

  initTabSync();

  return { getParams, setParam, deleteParam };
})();
