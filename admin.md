---
layout: description
title: New Post
permalink: /admin/
---
<h1>New Post</h1>
<p>GitHub 계정으로 저장소 권한을 확인한 후 이 브라우저에서 글을 작성할 수 있습니다.</p>
<div id="login-panel">
  <label for="github-token">GitHub fine-grained token (Contents: Read and write)</label>
  <input id="github-token" type="password" autocomplete="off" placeholder="토큰을 입력하세요">
  <button type="button" id="login-button">관리자 확인</button>
  <p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">GitHub에서 토큰 만들기</a> · 대상 저장소: PYeonju.github.io</p>
</div>
<form id="post-form" hidden>
  <p id="admin-user"></p>
  <button type="button" id="logout-button">로그아웃</button>
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
