---
layout: description
title: home
permalink: /home/
---

<div class="profile-actions" data-admin-only hidden>
    <button type="button" id="profile-edit">프로필 편집하기</button>
</div>
<div class="two-columns">
    <div class="column">
        <img id="profile-image" src="{{ site.data.profile.image | relative_url | escape }}" alt="프로필 사진">
    </div>
    <div class="column">
        <h2>About Me</h2>
        <p id="profile-intro">{{ site.data.profile.intro | escape }}</p>
    </div>
</div>
<dialog id="profile-dialog" aria-labelledby="profile-dialog-title">
    <form id="profile-form">
        <h2 id="profile-dialog-title">프로필 편집</h2>
        <label for="profile-photo">프로필 사진</label>
        <img id="profile-photo-preview" alt="선택한 프로필 사진">
        <input type="file" id="profile-photo" accept="image/png,image/jpeg,image/gif,image/webp">
        <p class="editor-help">PNG·JPG·GIF·WebP, 최대 10MB. 선택하지 않으면 기존 사진을 유지합니다.</p>
        <label for="profile-intro-input">소개</label>
        <textarea id="profile-intro-input" rows="7" maxlength="5000"></textarea>
        <p id="profile-status" role="status" aria-live="polite"></p>
        <div class="editor-actions">
            <button type="submit" id="profile-save" disabled>저장</button>
            <button type="button" id="profile-cancel">닫기</button>
        </div>
    </form>
</dialog>
<script defer src="{{ '/assets/js/image-compression.js' | relative_url }}?v={{ site.time | date: '%s' }}"></script>
<script defer src="{{ '/assets/js/publish-images.js' | relative_url }}?v={{ site.time | date: '%s' }}"></script>
<script defer src="{{ '/assets/js/profile.js' | relative_url }}?v={{ site.time | date: '%s' }}"></script>

<div style="text-align: center;">
    <h5>모든 블로그 글은 개인 공부 기록용을 위해 작성됩니다.</h5>
    <h5>오류나 틀린 부분이 있을 경우 언제든지 아래 메일 혹은 해당 글 댓글로 지적해주시면 감사하겠습니다!!</h5>
    <h4>pometeus98@gmail.com</h4>
</div>
