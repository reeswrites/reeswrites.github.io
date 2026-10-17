---
layout: none
permalink: /static/data/pages/movies.js
---
{%- comment -%} Full data for pages/data/movies.html (see _includes/page-data.html). {%- endcomment -%}
{%- assign movies = site.data.media.movies.watched | sort: "date" | reverse -%}
{%- capture fill_0 -%}{% include rows/movies-recent.html items=movies %}{%- endcapture -%}
{%- capture fill_1 -%}{% include rows/movies-table.html items=movies %}{%- endcapture -%}
window.PAGE_FILLS = {
    "#recent-list": {{ fill_0 | jsonify }},
    "#myTable tbody": {{ fill_1 | jsonify }},
};
const MOVIES = [{% for movie in movies %}[{{ movie.rating | default: 0 | times: 1.0 }},"{{ movie.date }}",{% if movie.genres %}{{ movie.genres | jsonify }}{% else %}[]{% endif %},"{{ movie.year | default: '' }}","{{ movie.director | default: '' }}",{{ movie.runtime | default: 0 }},{{ movie.dop | jsonify | default: "null" }},{{ movie.editor | jsonify | default: "null" }},{{ movie.composer | jsonify | default: "null" }},{% if movie.writers %}{{ movie.writers | jsonify }}{% else %}[]{% endif %},{{ movie.director_country | jsonify | default: "null" }}]{% unless forloop.last %},{% endunless %}{% endfor %}];
const MOVIE_MODAL_ITEMS = [{% for movie in movies %}{% if movie.tmdb_id %}{% assign movie_id = movie.tmdb_id %}{% else %}{% assign movie_id = movie.name | append: "|" | append: movie.year %}{% endif %}{id:{{ movie_id | jsonify }},title:{{ movie.name | jsonify }},year:{{ movie.year | jsonify }},director:{{ movie.director | jsonify }},genres:{{ movie.genres | default: "" | jsonify }},overview:{{ movie.overview | jsonify }},poster_path:{{ movie.poster_path | jsonify }},cast:{{ movie.cast | default: "" | jsonify }},rating:{{ movie.rating | default: 0 | times: 1.0 }},review:{{ movie.review | jsonify }},letterboxd_uri:{{ movie.letterboxd_uri | jsonify }},runtime:{{ movie.runtime | default: "null" }},tmdb_id:{{ movie.tmdb_id | default: "null" }},owned:{{ movie.owned | jsonify | default: "null" }}}{% unless forloop.last %},{% endunless %}{% endfor %}];
