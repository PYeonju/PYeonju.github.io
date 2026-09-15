---
layout: description
title: Series
permalink: /series/
---
<h1>Series</h1>
<p>시리즈를 선택하면 해당 글만 볼 수 있습니다.</p>
{% assign series_names = site.posts | map: 'series' | compact | uniq | sort %}
{% for series_name in series_names %}
  {% assign series_posts = site.posts | where: 'series', series_name %}
  <details class="series-group" id="{{ series_name | slugify }}">
    <summary>{{ series_name | escape }} <small>({{ series_posts.size }})</small></summary>
    {% include post_list.html posts=series_posts titles_only=true %}
  </details>
{% else %}
<p>아직 시리즈가 없습니다. 새 글의 Series 항목을 지정해 보세요.</p>
{% endfor %}
