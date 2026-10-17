---
layout: none
permalink: /static/data/pages/tv.js
---
{%- comment -%} Full data for pages/data/tv.html (see _includes/page-data.html). {%- endcomment -%}
{%- assign recent_shows = site.data.media.tv.shows | sort: "last_watched_at" | reverse -%}
{%- capture fill_0 -%}{% include rows/tv-recent.html items=recent_shows %}{%- endcapture -%}
{%- capture fill_1 -%}{% include rows/tv-table.html items=site.data.media.tv.shows %}{%- endcapture -%}
window.PAGE_FILLS = {
    "#recent-list": {{ fill_0 | jsonify }},
    "#myTable tbody": {{ fill_1 | jsonify }},
};
const TV_SHOWS = [{% for show in site.data.media.tv.shows %}{% assign eps = 0 %}{% if show.seasons %}{% for season in show.seasons %}{% if season.season > 0 %}{% assign season_eps = season.watched | size %}{% assign eps = eps | plus: season_eps %}{% endif %}{% endfor %}{% elsif show.mal_watched_episodes %}{% assign eps = show.mal_watched_episodes %}{% endif %}[{{ show.title | jsonify }},{{ show.year | default: "null" }},{{ show.mal_score | default: 0 }},{{ eps }},{{ show.genres | jsonify | default: "[]" }},{{ show.origin_country | jsonify | default: "[]" }},{{ show.episode_run_time | default: "null" }},{{ show.tmdb_id | default: "null" }}]{% unless forloop.last %},{% endunless %}
{% endfor %}];
const TV_MODAL_ITEMS = [{% for show in site.data.media.tv.shows %}{% assign show_id = show.tmdb_id | default: show.title %}{id:{{ show_id | jsonify }},title:{{ show.title | jsonify }},year:{{ show.year | default: "null" }},genres:{{ show.genres | default: "" | jsonify }},overview:{{ show.overview | jsonify }},poster_path:{{ show.poster_path | jsonify }},cast:{{ show.cast | default: "" | jsonify }},origin_country:{{ show.origin_country | default: "" | jsonify }},tmdb_id:{{ show.tmdb_id | default: "null" }},owned:{{ show.owned | jsonify | default: "null" }},seasons:{{ show.seasons | jsonify | default: "[]" }},last_watched_at:{{ show.last_watched_at | jsonify }},mal_score:{{ show.mal_score | default: "null" }},mal_watched_episodes:{{ show.mal_watched_episodes | default: "null" }},mal_total_episodes:{{ show.mal_total_episodes | default: "null" }},mal_status:{{ show.mal_status | jsonify }}}{% unless forloop.last %},{% endunless %}{% endfor %}];
