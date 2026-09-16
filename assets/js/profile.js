(function () {
  'use strict';
  const admin = window.BlogAdmin;
  const dialog = document.getElementById('profile-dialog');
  const form = document.getElementById('profile-form');
  const photo = document.getElementById('profile-photo');
  const preview = document.getElementById('profile-photo-preview');
  const intro = document.getElementById('profile-intro-input');
  const save = document.getElementById('profile-save');
  const cancel = document.getElementById('profile-cancel');
  const status = document.getElementById('profile-status');
  const path = '_data/profile.json';
  const types = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  const urls = [];
  let original = null;
  let selected = null;
  let loading = false;
  let saving = false;
  let checking = false;
  let generation = 0;
  function update() {
    save.disabled = !admin.verified || !original || loading || saving || checking;
    intro.disabled = photo.disabled = !admin.verified || loading || saving;
    cancel.disabled = saving;
  }
  function imageUrl(value) {
    // Profile photos are repository assets, never executable or external URLs.
    if (typeof value !== 'string' || !/^\/(?:Image|assets)\/[a-zA-Z0-9_./%-]+$/.test(value) || value.includes('..')) {
      throw new Error('프로필 사진 경로가 올바르지 않습니다.');
    }
    return value;
  }
  document.getElementById('profile-edit').addEventListener('click', async () => {
    if (!admin.verified || saving) return;
    const current = ++generation;
    original = selected = null;
    photo.value = '';
    intro.value = '';
    preview.removeAttribute('src');
    loading = true;
    update();
    status.textContent = '현재 프로필을 불러오는 중...';
    dialog.showModal();
    try {
      const branch = admin.branch;
      const file = await admin.request(admin.contentsPath(path) + '?ref=' + encodeURIComponent(branch));
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0))));
      if (typeof data.intro !== 'string' || !file.sha) throw new Error('프로필 데이터를 읽을 수 없습니다.');
      imageUrl(data.image);
      if (current !== generation || !admin.verified) return;
      original = { data, sha: file.sha, branch };
      intro.value = data.intro;
      preview.src = data.image;
      status.textContent = '';
    } catch (error) {
      if (current === generation) status.textContent = '불러오기 실패: ' + error.message;
    } finally {
      if (current === generation) { loading = false; update(); }
    }
  });
  photo.addEventListener('change', async () => {
    if (!admin.verified || !original || saving) return;
    const current = ++generation;
    selected = null;
    const file = photo.files[0];
    if (!file) { checking = false; preview.src = original.data.image; update(); return; }
    checking = true;
    update();
    try {
      if (!types[file.type]) throw new Error('PNG, JPG, GIF, WebP 이미지를 선택해 주세요.');
      if (file.size > 10 * 1024 * 1024) throw new Error('프로필 사진은 최대 10MB까지 가능합니다.');
      const optimized = await window.BlogImageCompression.optimize(file);
      if (current !== generation || !admin.verified) return;
      selected = optimized.file;
      const url = URL.createObjectURL(selected);
      urls.push(url);
      preview.src = url;
      status.textContent = '사진을 선택했습니다. 저장을 눌러야 반영됩니다.';
    } catch (error) {
      if (current === generation) { photo.value = ''; preview.src = original.data.image; status.textContent = error.message; }
    } finally {
      if (current === generation) { checking = false; update(); }
    }
  });
  function close() {
    if (saving) return;
    generation++;
    checking = loading = false;
    dialog.close();
  }
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.addEventListener('blog-admin-change', () => {
    if (!admin.verified) {
      generation++;
      checking = loading = false;
      dialog.close();
    }
    update();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (save.disabled || !admin.verified || !original) return;
    saving = true;
    update();
    status.textContent = '프로필을 저장하는 중...';
    try {
      const files = [];
      const data = { ...original.data, intro: intro.value };
      const localImage = preview.src;
      if (selected) {
        const imagePath = 'assets/images/profile/' + crypto.randomUUID() + '.' + types[selected.type];
        let binary = '';
        for (const byte of new Uint8Array(await selected.arrayBuffer())) binary += String.fromCharCode(byte);
        files.push({ path: imagePath, content: btoa(binary) });
        data.image = '/' + imagePath;
      }
      if (!selected && data.intro === original.data.intro) { status.textContent = '변경된 내용이 없습니다.'; return; }
      const result = await window.publishPostWithImages({ path, source: JSON.stringify(data, null, 2) + '\n', files,
        branch: original.branch, expectedSha: original.sha, message: 'Update home profile' });
      original = { ...original, data, sha: result.content.sha };
      document.getElementById('profile-intro').textContent = data.intro;
      if (selected) document.getElementById('profile-image').src = localImage;
      selected = null;
      photo.value = '';
      status.textContent = '저장 완료! 방문자에게는 배포가 끝나면 반영됩니다.';
    } catch (error) {
      status.textContent = error.status === 409
        ? '다른 변경 내용과 충돌했습니다. 소개를 복사해 보관한 뒤 닫고 다시 열어 주세요. 입력 내용은 유지됩니다.'
        : '저장 실패: ' + error.message;
    } finally { saving = false; update(); }
  });
  window.addEventListener('pagehide', () => urls.forEach(url => URL.revokeObjectURL(url)));
  update();
}());
