(function () {
  "use strict";

  /* ── Data ────────────────────────────────────────────────────────────────── */

  const raw = window.TOPIC_TREE_DATA || { tree: {} };
  const ROOT = raw.tree || {};

  /* ── State ───────────────────────────────────────────────────────────────── */

  // currentPath: array of child indices from root to current node.
  // e.g. [] = root, [1] = root.children[1]
  let currentPath = [];

  /* ── Tree helpers ────────────────────────────────────────────────────────── */

  // Total topic nodes in the entire tree (all depths).
  function countAllTopics(node) {
    if (!node || node.kind !== "topic") return 0;
    return 1 + (node.children || []).reduce((s, c) => s + countAllTopics(c), 0);
  }
  // Subtract 1 to exclude the invisible root wrapper node itself.
  const TOTAL_TOPIC_COUNT = Math.max(0, countAllTopics(ROOT) - 1);

  /* ── Routing helpers ─────────────────────────────────────────────────────── */

  function getNodeAtPath(path) {
    let node = ROOT;
    for (const idx of path) {
      if (!node.children || idx >= node.children.length) return null;
      node = node.children[idx];
    }
    return node;
  }

  function saveToURL(path) {
    const url = new URL(window.location.href);
    if (path.length > 0) {
      url.searchParams.set("path", path.join(","));
    } else {
      url.searchParams.delete("path");
    }
    history.replaceState(null, "", url.toString());
  }

  function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("path");
    if (!p) return [];
    const parsed = p
      .split(",")
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0);
    // Validate that the path resolves to a topic node (not a post leaf or missing)
    const node = getNodeAtPath(parsed);
    if (node && node.kind === "topic") return parsed;
    return [];
  }

  /* ── Type counting ───────────────────────────────────────────────────────── */

  function collectTypeCounts(node) {
    if (node.kind === "post") return { [node.type || "other"]: 1 };
    const counts = {};
    for (const child of node.children || []) {
      for (const [t, n] of Object.entries(collectTypeCounts(child))) {
        counts[t] = (counts[t] || 0) + n;
      }
    }
    return counts;
  }

  // "notes" is already plural; everything else gets an "s"
  function pluralType(type, n) {
    return n === 1 && type !== "notes" ? type : type + (type.endsWith("s") ? "" : "s");
  }

  function formatTypeCounts(counts) {
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, n]) => `${n} ${pluralType(type, n)}`)
      .join(" · ");
  }

  /* ── Rendering ───────────────────────────────────────────────────────────── */

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderBreadcrumb() {
    const el = document.getElementById("tt-breadcrumb");
    if (!el) return;

    const crumbs = [{ label: "Topics", path: [], count: TOTAL_TOPIC_COUNT }];
    let node = ROOT;
    for (let i = 0; i < currentPath.length; i++) {
      node = node.children[currentPath[i]];
      if (!node) break;
      crumbs.push({
        label: node.label || node.title || "…",
        path: currentPath.slice(0, i + 1),
        count: node.count,
      });
    }

    el.innerHTML = crumbs
      .map((c, i) => {
        const isLast = i === crumbs.length - 1;
        const countBadge = c.count != null
          ? ` <span class="tt-crumb-count">(${c.count})</span>`
          : "";
        if (isLast) {
          return `<span class="tt-crumb tt-crumb-current" aria-current="page">${esc(c.label)}${countBadge}</span>`;
        }
        const pathStr = c.path.length ? c.path.join(",") : "";
        return `<a class="tt-crumb tt-crumb-link" href="#" data-path="${esc(pathStr)}">${esc(c.label)}${countBadge}</a>`;
      })
      .join('<span class="tt-crumb-sep" aria-hidden="true">›</span>');

    el.querySelectorAll(".tt-crumb-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const pathStr = a.dataset.path;
        currentPath = pathStr ? pathStr.split(",").map(Number) : [];
        saveToURL(currentPath);
        render();
      });
    });
  }

  function renderDescription(node) {
    const el = document.getElementById("tt-description");
    if (!el) return;
    if (node && node.kind === "topic") {
      const total = node.count != null ? `${node.count} post${node.count !== 1 ? "s" : ""}` : "";
      const types = formatTypeCounts(collectTypeCounts(node));
      el.textContent = total ? `${total} (${types})` : types;
    } else {
      el.textContent = "";
    }
  }

  // fullPath: absolute index array from ROOT (not relative to currentPath)
  function renderTopicCard(child, fullPath) {
    const card = document.createElement("div");
    card.className = "tt-card tt-card-topic";
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Browse topic: ${child.label}`);

    const countText = formatTypeCounts(collectTypeCounts(child));

    card.innerHTML = `
      <div class="tt-card-label">${esc(child.label)}</div>
      <div class="tt-card-rep">${esc(child.representative || "")}</div>
      <div class="tt-card-count">${esc(countText)}</div>
    `;

    const drillIn = () => {
      currentPath = fullPath;
      saveToURL(currentPath);
      render();
    };
    card.addEventListener("click", drillIn);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        drillIn();
      }
    });
    return card;
  }

  function renderPostCard(child) {
    const a = document.createElement("a");
    a.className = "tt-card tt-card-post";
    a.href = child.url || "#";
    a.setAttribute("data-type", child.type || "article");
    a.setAttribute("role", "listitem");

    a.innerHTML = `
      <div class="tt-card-type">${esc(child.type || "")}</div>
      <div class="tt-card-title">${esc(child.title || "")}</div>
      <div class="tt-card-desc">${esc(child.description || "")}</div>
      <div class="tt-card-date">${esc(child.date || "")}</div>
    `;
    return a;
  }

  function renderChildren(node) {
    const el = document.getElementById("tt-children");
    if (!el) return;
    el.innerHTML = "";

    const children = node ? node.children || [] : [];

    if (children.length === 0) {
      const msg = document.createElement("p");
      msg.className = "tt-empty";
      msg.textContent = "No posts found in this topic.";
      el.appendChild(msg);
      return;
    }

    children.forEach((child, idx) => {
      const fullPath = [...currentPath, idx];
      if (child.kind === "topic") {
        el.appendChild(renderTopicCard(child, fullPath));
      } else {
        el.appendChild(renderPostCard(child));
      }
    });
  }

  function render() {
    const node = getNodeAtPath(currentPath);
    if (!node || node.kind !== "topic") {
      // Invalid path: reset to root
      currentPath = [];
      saveToURL(currentPath);
    }
    const currentNode = getNodeAtPath(currentPath);
    renderBreadcrumb();
    renderDescription(currentNode);
    renderChildren(currentNode);
    // Scroll to top of the tree content on navigation
    const page = document.getElementById("topic-tree-page");
    if (page) page.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ── Init ────────────────────────────────────────────────────────────────── */

  function init() {
    currentPath = loadFromURL();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
