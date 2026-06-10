/**
 * DataModal — detail modal with URL deep-linking for data pages.
 *
 * Usage:
 *   DataModal.init({ items: MODAL_ITEMS, render: (item) => "<html>" });
 *
 * Each item must have an `id` string. The caller provides a `render` function
 * that returns HTML for the modal body given a single item object.
 *
 * URL state: ?item=<id> — set on open, cleared on close, restored on load.
 */
const DataModal = (() => {
  let _map = {};
  let _renderFn = null;
  let _bsModal = null;
  let _citations = {}; // bare item id → [{title, url, date, slug}]
  let _citationPage = null; // permalink of the current data page, e.g. "/data/movies"

  function init({ items, render, citations, page }) {
    for (const item of items || []) {
      if (item.id != null) _map[String(item.id)] = item;
    }
    _renderFn = render;
    _citations = citations || {};
    _citationPage = page || null;

    // Bootstrap bundle loads after this script (it's in the footer), so defer
    // setup until DOMContentLoaded when Bootstrap is guaranteed to be available.
    function _setup() {
      const el = document.getElementById("dataModal");
      if (!el || typeof bootstrap === "undefined") return;
      _bsModal = new bootstrap.Modal(el);

      el.addEventListener("hidden.bs.modal", () => {
        if (typeof DataUrlState !== "undefined") DataUrlState.deleteParam("item");
      });

      document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-modal-id]");
        if (btn) _open(btn.dataset.modalId);
      });

      window.addEventListener("popstate", () => {
        const id = _currentItemId();
        if (id) _open(id, false);
        else _bsModal?.hide();
      });

      const initial = _currentItemId();
      if (initial) requestAnimationFrame(() => _open(initial, false));
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", _setup);
    } else {
      _setup();
    }
  }

  function _currentItemId() {
    if (typeof DataUrlState === "undefined") return null;
    return DataUrlState.getParams().get("item") || null;
  }

  function _open(id, writeURL = true) {
    const item = _map[String(id)];
    if (!item || !_bsModal || !_renderFn) return;
    const label = document.getElementById("dataModalLabel");
    if (label) label.textContent = item.title || item.name || "";
    const body = document.getElementById("dataModalBody");
    if (body) {
      let html = _renderFn(item);

      // Append "Referenced in these articles" section when citations exist for this item
      const posts = _citations && _citations[String(id)] ? _citations[String(id)].posts : null;
      if (posts && posts.length) {
        const links = posts
          .map((p) => `<li><a href="${p.url}">${_escHtml(p.title)}</a></li>`)
          .join("");
        html += `<div class="mt-3 border-top pt-3">
          <h6 class="text-muted small text-uppercase mb-2">Referenced in these articles</h6>
          <ul class="list-unstyled mb-0 small">${links}</ul>
        </div>`;
      }

      body.innerHTML = html;
    }

    // Update the copy-citation button with the correct URL for this item
    const copyBtn = document.getElementById("dataModalCopyLink");
    if (copyBtn) {
      const page = _citationPage || window.location.pathname.replace(/\/$/, "");
      copyBtn.onclick = () => {
        const url = `${window.location.origin}${page}?item=${encodeURIComponent(id)}`;
        navigator.clipboard.writeText(url).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => (copyBtn.textContent = "Copy citation link"), 1500);
        });
      };
    }

    if (writeURL && typeof DataUrlState !== "undefined") DataUrlState.setParam("item", id);
    _bsModal.show();
  }

  function _escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Helpers for render functions —————————————————————————————————————————

  function starHTML(rating, max = 5) {
    if (!rating) return "";
    const r = parseFloat(rating);
    const full = Math.floor(r);
    const half = r - full >= 0.5;
    let s = "⭐️".repeat(full);
    if (half) s += "½";
    return `<span title="${r}/${max}">${s}</span>`;
  }

  function posterHTML(src, alt) {
    if (!src) return "";
    return `<img src="${src}" alt="${alt || ""}" class="img-fluid rounded mb-3" style="max-height:300px;max-width:100%">`;
  }

  function tagList(items) {
    if (!items || !items.length) return "";
    return items.map((t) => `<span class="badge text-bg-secondary me-1">${t}</span>`).join("");
  }

  function row(label, value) {
    if (!value) return "";
    return `<dt class="col-sm-4">${label}</dt><dd class="col-sm-8">${value}</dd>`;
  }

  function externalLink(href, label) {
    if (!href) return "";
    return `<a href="${href}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-secondary me-2">${label}</a>`;
  }

  // Per-type render helpers ——————————————————————————————————————————————

  function renderPosterLeft(posterSrc, alt, meta, links) {
    const posterCol = posterSrc ? `<div class="col-auto">${posterHTML(posterSrc, alt)}</div>` : "";
    return `
        <div class="row g-3">
          ${posterCol}
          <div class="col">
            <dl class="row mb-2">${meta}</dl>
            ${links ? `<div class="mt-2">${links}</div>` : ""}
          </div>
        </div>`;
  }

  // Public render helpers that pages can call from their render fn

  function renderMovie(item) {
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null;
    const meta = [
      row("Year", item.year),
      row("Director", item.director),
      row("Rating", starHTML(item.rating)),
      row("Runtime", item.runtime ? `${item.runtime} min` : null),
      row("Genres", tagList(item.genres)),
    ].join("");
    const links = [
      externalLink(item.letterboxd_uri, "Letterboxd"),
      item.tmdb_id ? externalLink(`https://www.themoviedb.org/movie/${item.tmdb_id}`, "TMDB") : "",
    ].join("");
    let html = renderPosterLeft(poster, item.title, meta, links);
    if (item.overview) html += `<p class="mt-3">${item.overview}</p>`;
    if (item.cast && item.cast.length)
      html += `<p class="text-muted small mt-2">Cast: ${item.cast.join(", ")}</p>`;
    if (item.review && !item.review.startsWith("Watched on "))
      html += `<div class="mt-3 border-top pt-3">
        <h6 class="text-muted small text-uppercase mb-1">My review</h6>
        <blockquote class="blockquote mb-0"><p class="small mb-0">${_escHtml(item.review).replace(/\n/g, "<br>")}</p></blockquote>
      </div>`;
    return html;
  }

  function renderBook(item) {
    const meta = [
      row("Author", item.author),
      row("Year", item.year_published),
      row("Rating", starHTML(item.my_rating, 5)),
      row("Pages", item.number_of_pages),
      row("Genres", tagList(item.genres)),
    ].join("");
    const goodreadsHref = item.isbn ? `https://www.goodreads.com/book/isbn/${item.isbn}` : null;
    const links = externalLink(goodreadsHref, "Goodreads");
    let html = renderPosterLeft(item.cover, item.title, meta, links);
    if (item.description) html += `<p class="mt-3 small">${item.description}</p>`;
    if (item.my_review)
      html += `<blockquote class="blockquote mt-3"><p class="small">${item.my_review}</p></blockquote>`;
    return html;
  }

  function renderBeer(item) {
    const venue = item.venue
      ? `${item.venue}${item.venue_city ? ` — ${item.venue_city}, ${item.venue_state}` : ""}`
      : null;
    const flavors = item.flavor_profiles
      ? item.flavor_profiles
          .split(",")
          .map((f) => `<span class="badge text-bg-secondary me-1">${f.trim()}</span>`)
          .join("")
      : null;
    const meta = [
      row(
        "Brewery",
        item.brewery
          ? `${item.brewery}${item.brewery_city ? ` (${item.brewery_city}, ${item.brewery_state})` : ""}`
          : null,
      ),
      row("Style", item.style),
      row("Serving", item.serving),
      row("Rating", starHTML(item.rating, 5)),
      row("ABV", item.abv ? `${item.abv}%` : null),
      row("IBU", item.ibu || null),
      row("Flavors", flavors),
      row("Venue", venue),
      row("Date", item.date),
    ].join("");
    const links = externalLink(item.beer_url, "Untappd");
    let html = `<dl class="row mb-2">${meta}</dl>${links ? `<div class="mt-2">${links}</div>` : ""}`;
    if (item.review)
      html += `<blockquote class="blockquote mt-3"><p class="small">${item.review}</p></blockquote>`;
    return html;
  }

  function renderTV(item) {
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null;
    const meta = [
      row("Year", item.year),
      row("Genres", tagList(item.genres)),
      row("Origin", item.origin_country ? item.origin_country.join(", ") : null),
    ].join("");
    const links = item.tmdb_id
      ? externalLink(`https://www.themoviedb.org/tv/${item.tmdb_id}`, "TMDB")
      : "";
    let html = renderPosterLeft(poster, item.title, meta, links);
    if (item.overview) html += `<p class="mt-3">${item.overview}</p>`;
    if (item.cast && item.cast.length)
      html += `<p class="text-muted small mt-2">Cast: ${item.cast.join(", ")}</p>`;
    return html;
  }

  function renderRecord(item) {
    const meta = [
      row("Artist", item.artist),
      row("Year", item.year),
      row("Genre", item.genre),
      row("Label", item.label),
    ].join("");
    let html = renderPosterLeft(item.cover, item.title, meta, "");
    if (item.artist_bio) html += `<p class="mt-3 small text-muted">${item.artist_bio}</p>`;
    if (item.tracklist && item.tracklist.length) {
      const tracks = item.tracklist
        .map(
          (t) =>
            `<li class="list-group-item py-1 px-2 small">${t.position ? `<span class="text-muted me-2">${t.position}</span>` : ""}${t.title}</li>`,
        )
        .join("");
      html += `<h6 class="mt-3">Tracklist</h6><ul class="list-group list-group-flush">${tracks}</ul>`;
    }
    return html;
  }

  return { init, renderMovie, renderBook, renderBeer, renderTV, renderRecord };
})();
