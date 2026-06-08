/**
 * Shared activity-feed helpers.
 *
 * Exposes window.ActivityFeed = { EMOJI, renderEntry, load }.
 * Used by both the full /activity page (activity.js) and the home-page
 * excerpt (index.html).
 */
window.ActivityFeed = (function () {
  const EMOJI = {
    post: "📝",
    beer: "🍺",
    movie: "🎬",
    book: "📚",
    tv: "📺",
    lifting: "💪",
    cardio: "🏃",
    steps: "👣",
    changelog: "🔧",
  };

  const DATA_PAGES = {
    beer: "/data/beer",
    movie: "/data/movies",
    book: "/data/books-read",
    tv: "/data/tv",
    lifting: "/data/lifting",
    cardio: "/data/cardio",
    steps: "/data/steps",
    changelog: "/changelog",
  };

  function renderEntry(entry, opts = {}) {
    const emoji = EMOJI[entry.type] || "•";
    let text = "";

    switch (entry.type) {
      case "post":
        text = `published <a href="${entry.url}">${entry.label}</a>`;
        break;
      case "beer":
        text = `drank <em>${entry.label}</em>`;
        if (entry.detail) text += ` &mdash; ${formatRating(entry.detail)}`;
        break;
      case "movie":
        text = `watched <em>${entry.label}</em>`;
        if (entry.year) text += ` (${entry.year})`;
        if (entry.detail) text += ` &mdash; ${formatRating(entry.detail)}`;
        break;
      case "book":
        text = `finished reading <em>${entry.label}</em>`;
        if (entry.detail) text += ` &mdash; ${entry.detail}`;
        break;
      case "tv":
        text = `watched ${entry.detail} of <em>${entry.label}</em>`;
        break;
      case "lifting":
        text = opts.compact
          ? `lifted ${entry.label}`
          : `lifted ${entry.label} <a href="/data/lifting#${entry.date}">(view details)</a>`;
        break;
      case "cardio":
        text = `<a href="/data/cardio#${entry.date}">${entry.label.toLowerCase()}</a>`;
        if (entry.detail) text += ` &mdash; ${entry.detail}`;
        break;
      case "steps":
        text = `walked ${entry.label}`;
        break;
      case "changelog": {
        const items = entry.entries.map((e) => `<li>${e}</li>`).join("");
        const arrow = opts.compact
          ? ` <a class="entry-data-link" href="${DATA_PAGES.changelog}">&rarr;</a>`
          : "";
        return `<li class="mb-1">${emoji} updated site${arrow}<ul class="mb-0">${items}</ul></li>`;
      }
      default:
        text = entry.label;
    }

    const dataPage = DATA_PAGES[entry.type];
    const arrow = opts.compact && dataPage
      ? ` <a class="entry-data-link" href="${dataPage}">&rarr;</a>`
      : "";
    return `<li class="mb-1">${emoji} ${text}${arrow}</li>`;
  }

  /**
   * Convert a "N/5" or "N.M/5" rating string to star characters.
   * Rounds to the nearest half-star. Returns the original string if not parseable.
   */
  function formatRating(detail) {
    const m = detail.match(/^(\d+(?:\.\d+)?)\/(\d+)$/);
    if (!m) return detail;
    const score = parseFloat(m[1]);
    const max = parseInt(m[2], 10);
    const filled = Math.round(score * 2) / 2;  // nearest 0.5
    let stars = "";
    for (let i = 1; i <= max; i++) {
      if (i <= filled) stars += "★";
      else if (i - 0.5 === filled) stars += "½";
      else stars += "☆";
    }
    return stars;
  }

  /**
   * Fetch activity.json and merge with the given posts array (from Jekyll).
   * Returns the full merged list sorted newest-first.
   */
  async function load(posts) {
    const res = await fetch("/static/data/activity.json");
    const data = await res.json();
    return [...data.entries, ...posts].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }

  return { EMOJI, renderEntry, formatRating, load };
})();
