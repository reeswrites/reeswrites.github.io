const DAYS_CHUNK = 90;
let allEntries = [];
let daysShown = DAYS_CHUNK;
let activeType = "all";
const btnLabels = {};

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

async function init() {
  document.querySelectorAll("#filter-buttons [data-type]").forEach((btn) => {
    btnLabels[btn.dataset.type] = btn.textContent.trim();
  });

  try {
    const res = await fetch("/static/data/activity.json");
    const data = await res.json();
    allEntries = [...data.entries, ...POSTS].sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) {
    document.getElementById("loading").textContent = "Failed to load activity data.";
    return;
  }
  document.getElementById("loading").style.display = "none";
  render();
}

function cutoffDate() {
  const d = new Date();
  d.setDate(d.getDate() - daysShown);
  return d.toISOString().slice(0, 10);
}

function visibleEntries() {
  const cutoff = cutoffDate();
  return allEntries.filter((e) => {
    if (e.date < cutoff) return false;
    if (activeType !== "all" && e.type !== activeType) return false;
    return true;
  });
}

function hasOlderEntries() {
  const cutoff = cutoffDate();
  return allEntries.some((e) => e.date < cutoff && (activeType === "all" || e.type === activeType));
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderEntry(entry) {
  const emoji = EMOJI[entry.type] || "•";
  let text = "";

  switch (entry.type) {
    case "post":
      text = `published <a href="${entry.url}">${entry.label}</a>`;
      break;
    case "beer":
      text = `drank <em>${entry.label}</em>`;
      if (entry.detail) text += ` &mdash; ${entry.detail}`;
      break;
    case "movie":
      text = `watched <em>${entry.label}</em>`;
      if (entry.detail) text += ` &mdash; ${entry.detail}`;
      break;
    case "book":
      text = `finished reading <em>${entry.label}</em>`;
      if (entry.detail) text += ` &mdash; ${entry.detail}`;
      break;
    case "tv":
      text = `watched ${entry.detail} of <em>${entry.label}</em>`;
      break;
    case "lifting":
      text = `${entry.label} <a href="/data/lifting#${entry.date}">(view details)</a>`;
      break;
    case "cardio":
      text = `<a href="/data/cardio#${entry.date}">${entry.label.toLowerCase()}</a>`;
      if (entry.detail) text += ` &mdash; ${entry.detail}`;
      break;
    case "steps":
      text = entry.label;
      break;
    case "changelog": {
      const items = entry.entries.map((e) => `<li>${e}</li>`).join("");
      return `<li class="mb-1">${emoji} updated site<ul class="mb-0">${items}</ul></li>`;
    }
    default:
      text = entry.label;
  }

  return `<li class="mb-1">${emoji} ${text}</li>`;
}

function updateBlurb() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysShown);
  const from = cutoff.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const label =
    activeType === "all"
      ? "all activity"
      : document.querySelector(`[data-type="${activeType}"]`)?.textContent.trim() + " activity";
  document.getElementById("date-range-blurb").textContent =
    `Showing ${label} from ${from} to today.`;
}

function render() {
  const entries = visibleEntries();
  const feed = document.getElementById("activity-feed");
  const loadMoreBtn = document.getElementById("load-more");
  updateBlurb();

  const cutoff = cutoffDate();
  const windowEntries = allEntries.filter((e) => e.date >= cutoff);
  const counts = {};
  for (const e of windowEntries) counts[e.type] = (counts[e.type] || 0) + 1;
  document.querySelectorAll("#filter-buttons [data-type]").forEach((btn) => {
    const type = btn.dataset.type;
    if (type === "all") return;
    const n = counts[type] || 0;
    btn.textContent = `${btnLabels[type]} (${n.toLocaleString()})`;
  });

  if (entries.length === 0) {
    feed.innerHTML = "<p class='text-muted'>No activity in this range.</p>";
    loadMoreBtn.style.display = "none";
    return;
  }

  const byDate = {};
  for (const entry of entries) {
    if (!byDate[entry.date]) byDate[entry.date] = [];
    byDate[entry.date].push(entry);
  }

  let html = "";
  for (const date of Object.keys(byDate).sort((a, b) => b.localeCompare(a))) {
    html += `<h6 class="mt-3 mb-1 text-muted">${formatDate(date)}</h6>`;
    html += `<ul class="list-unstyled ms-2 mb-0">`;
    for (const entry of byDate[date]) {
      html += renderEntry(entry);
    }
    html += `</ul>`;
  }

  feed.innerHTML = html;
  loadMoreBtn.style.display = hasOlderEntries() ? "block" : "none";
}

document.getElementById("filter-buttons").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-type]");
  if (!btn) return;
  document.querySelectorAll("#filter-buttons [data-type]").forEach((b) => {
    b.classList.remove("btn-success", "active");
    b.classList.add("btn-outline-success");
  });
  btn.classList.add("btn-success", "active");
  btn.classList.remove("btn-outline-success");
  activeType = btn.dataset.type;
  daysShown = DAYS_CHUNK;
  render();
});

document.getElementById("load-more").addEventListener("click", () => {
  daysShown += DAYS_CHUNK;
  render();
});

init();
