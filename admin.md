---
layout: description
title: New Post
permalink: /admin/
---
<h1>New Post</h1>
<p id="editor-locked">상단의 <strong>관리자 권한</strong>에서 GitHub 토큰을 인증하면 글을 작성할 수 있습니다.</p>
<form id="post-form" hidden>
  <label for="post-title">제목</label>
  <input id="post-title" required maxlength="120">
  <label for="post-series">Series (선택)</label>
  <input id="post-series" list="known-series" placeholder="예: C++">
  <datalist id="known-series">
    {% assign series_names = site.posts | map: 'series' | compact | uniq | sort %}
    {% for series_name in series_names %}<option value="{{ series_name | escape }}">{% endfor %}
  </datalist>
  <label for="post-summary">짧은 소개 (선택)</label>
  <input id="post-summary" maxlength="200">
  <label for="post-content">본문 (Markdown)</label>
  <textarea id="post-content" required rows="18" placeholder="# 첫 번째 문단"></textarea>
  <button type="submit" id="publish-button">글 등록</button>
</form>
<p id="post-status" role="status" aria-live="polite"></p>
<script defer src="{{ '/assets/js/editor.js' | relative_url }}"></script>
