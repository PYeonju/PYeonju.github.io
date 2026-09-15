(function () {
  'use strict';
  const button = document.getElementById('preview-button');
  const panel = document.getElementById('post-preview');
  const frame = document.getElementById('preview-frame');
  const status = document.getElementById('preview-status');
  const form = document.getElementById('post-form');
  const admin = window.BlogAdmin;
  let generation = 0;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function clear() {
    generation++;
    panel.hidden = true;
    frame.srcdoc = '';
    status.textContent = '';
    button.disabled = !admin.verified;
  }
  form.addEventListener('reset', clear);
  document.addEventListener('blog-admin-change', clear);
  clear();
  button.addEventListener('click', async () => {
    if (!admin.verified || button.disabled) return;
    const body = document.getElementById('post-content').value;
    if (!body.trim()) { status.textContent = '미리 볼 본문을 입력해 주세요.'; return; }
    const title = document.getElementById('post-title').value;
    const current = ++generation;
    button.disabled = true;
    status.textContent = '미리보기를 만드는 중...';
    panel.hidden = true;
    try {
      const html = await admin.request('/markdown', {
        method: 'POST', headers: { Accept: 'text/html', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body, mode: 'gfm' })
      }, 'text');
      if (current !== generation || !admin.verified) return;
      const styles = new URL(frame.dataset.styles, window.location.href).href;
      const base = window.location.origin + '/';
      // The sandbox has no script or same-origin permission: preview content cannot access the token.
      frame.srcdoc = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="' + escape(base) + '"><link rel="stylesheet" href="' + escape(styles) + '"></head><body class="preview-body"><header class="post-header"><h1 class="post-title">' + escape(title) + '</h1></header><div class="post-content">' + html + '</div></body></html>';
      panel.hidden = false;
      status.textContent = '미리보기를 갱신했습니다.';
    } catch (error) {
      if (current === generation) status.textContent = '미리보기 실패: ' + error.message;
    } finally {
      if (current === generation) button.disabled = !admin.verified;
    }
  });
}());
