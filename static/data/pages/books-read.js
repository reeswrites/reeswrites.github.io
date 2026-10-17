---
layout: none
permalink: /static/data/pages/books-read.js
---
{%- comment -%} Full data for pages/data/books_read.html (see _includes/page-data.html). {%- endcomment -%}

{%- capture fill_0 -%}{% include rows/books-read-recent.html items=site.data.media.books.read %}{%- endcapture -%}
{%- capture fill_1 -%}{% include rows/books-read-table.html items=site.data.media.books.read %}{%- endcapture -%}
window.PAGE_FILLS = {
    "#recent-list": {{ fill_0 | jsonify }},
    "#myTable tbody": {{ fill_1 | jsonify }},
};
const BOOK_MODAL_ITEMS = [{% for book in site.data.media.books.read %}{% assign book_id = book.isbn13 | default: book.isbn | default: book.title %}{id:{{ book_id | jsonify }},title:{{ book.title | jsonify }},author:{{ book.author | jsonify }},year_published:{{ book.year_published | jsonify }},genres:{{ book.genres | default: "" | jsonify }},description:{{ book.description | jsonify }},cover:{{ book.cover | jsonify }},my_rating:{{ book.my_rating | default: 0 | plus: 0 }},my_review:{{ book.my_review | jsonify }},number_of_pages:{{ book.number_of_pages | jsonify }},isbn:{{ book.isbn | jsonify }},owned:{{ book.owned | jsonify | default: "null" }}}{% unless forloop.last %},{% endunless %}{% endfor %}];
