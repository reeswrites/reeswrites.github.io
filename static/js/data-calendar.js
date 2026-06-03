"use strict";

/**
 * Initialize a FullCalendar instance with a lazy-render guard and star-rating
 * tooltips.  Requires FullCalendar and Bootstrap to be loaded first.
 *
 * @param {{ tabId: string, calEl: string, initialDate: string, events: Array }} opts
 *   tabId       — id of the Bootstrap tab button (e.g. "calendar-tab")
 *   calEl       — id of the calendar container element (e.g. "calendar")
 *   initialDate — ISO date string for the starting view (e.g. "2024-01-15")
 *   events      — FullCalendar events array; each entry may have extendedProps:
 *                   { rating: number, review: string }
 */
function initCalendar({ tabId, calEl, initialDate, events }) {
  let rendered = false;
  document.getElementById(tabId).addEventListener("shown.bs.tab", () => {
    if (rendered) return;
    rendered = true;
    const calendar = new FullCalendar.Calendar(document.getElementById(calEl), {
      initialDate,
      initialView: "dayGridMonth",
      eventDidMount(info) {
        const rating = info.event.extendedProps.rating;
        let tip = info.event.title;
        if (rating) {
          const stars = _calFormatStars(rating);
          if (stars) tip += "<br>" + stars;
        }
        if (info.event.extendedProps.review) tip += "<br>" + info.event.extendedProps.review;
        new bootstrap.Tooltip(info.el, {
          html:      true,
          title:     tip,
          placement: "top",
          trigger:   "hover",
          container: "body",
        });
      },
      events,
    });
    calendar.render();
  });
}

/** Fractional star string — mirrors _includes/starRating.html. */
function _calFormatStars(rating) {
  if (!rating || rating <= 0) return "";
  const rounded = Math.floor(rating);
  let result = "⭐️".repeat(rounded);
  if (rating > rounded) {
    const dec = Math.floor((rating - rounded) * 100);
    if (dec === 25) result += "1/4";
    else if (dec === 50) result += "1/2";
    else if (dec === 75) result += "3/4";
    else result += `.${dec}`;
  }
  return result;
}
