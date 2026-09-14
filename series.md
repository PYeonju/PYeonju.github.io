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
  <section class="series-group" id="{{ series_name | slugify }}">
    <h2>{{ series_name }} <small>({{ series_posts.size }})</small></h2>
    {% include post_list.html posts=series_posts %}
  </section>
{% else %}
<p>아직 시리즈가 없습니다. 새 글의 Series 항목을 지정해 보세요.</p>
{% endfor %}
