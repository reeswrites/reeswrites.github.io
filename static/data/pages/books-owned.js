---
layout: none
permalink: /static/data/pages/books-owned.js
---
{%- comment -%} Full data for pages/inventory/books_owned.html (see _includes/page-data.html). {%- endcomment -%}

{%- capture fill_0 -%}{% include rows/books-owned-table.html items=site.data.media.books.owned %}{%- endcapture -%}
window.PAGE_FILLS = {
    "#myTable tbody": {{ fill_0 | jsonify }},
};
// Compact payload: [author, pages, yearPublished, avgRating, genres]
const BOOKS_OWNED = [{% for b in site.data.media.books.owned %}[{{ b.author | jsonify }}, {{ b.number_of_pages | default: 0 }}, "{{ b.year_published | default: '' }}", {{ b.average_rating | default: 0 }}, {{ b.genres | jsonify }}]{% unless forloop.last %},{% endunless %}{% endfor %}];
const BOOKS_OWNED_MODAL_ITEMS = [{% for b in site.data.media.books.owned %}{% assign book_id = b.isbn13 | default: b.isbn | default: b.title %}{id:{{ book_id | jsonify }},title:{{ b.title | jsonify }},author:{{ b.author | jsonify }},year_published:{{ b.year_published | jsonify }},my_rating:{{ b.my_rating | default: 0 | times: 1 }},number_of_pages:{{ b.number_of_pages | default: "null" }},genres:{{ b.genres | jsonify }},cover:{{ b.cover | jsonify }},description:{{ b.description | jsonify }},my_review:{{ b.my_review | jsonify }},isbn:{{ book_id | jsonify }}}{% unless forloop.last %},{% endunless %}{% endfor %}];
