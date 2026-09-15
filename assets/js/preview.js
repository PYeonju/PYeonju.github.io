(function () {
  'use strict';
  const button = document.getElementById('preview-button');
  const panel = document.getElementById('post-preview');
  const frame = document.getElementById('preview-frame');
  const status = document.getElementById('preview-status');
  const form = document.getElementById('post-form');
  const admin = window.BlogAdmin;
  let generation = 0;
  const scriptUrl = new URL(document.currentScript?.src || '/assets/js/preview.js', window.location.href);
  let rendererPromise = null;
  function getRenderer() {
    if (typeof markdownit === 'function') return Promise.resolve(markdownit);
    if (rendererPromise) return rendererPromise;
    // An older cached editor page may not include the renderer script.
    rendererPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const url = new URL('../vendor/markdown-it-15.0.2.min.js', scriptUrl);
      url.search = scriptUrl.search;
      script.src = url.href;
      let finished = false;
      const finish = error => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        script.remove();
        if (error) { rendererPromise = null; reject(error); }
        else resolve(markdownit);
      };
      const timeout = setTimeout(() => finish(new Error('미리보기 파일을 불러오지 못했습니다. 다시 눌러 주세요.')), 15000);
      script.onload = () => finish(typeof markdownit === 'function' ? null : new Error('미리보기 변환기를 초기화하지 못했습니다.'));
      script.onerror = () => finish(new Error('미리보기 파일을 불러오지 못했습니다. 다시 눌러 주세요.'));
      document.head.append(script);
    });
    return rendererPromise;
  }
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
  document.addEventListener('blog-draft-restored', clear);
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
      const render = await getRenderer();
      const html = render({ html: false, breaks: true, linkify: true }).render(body);
      if (current !== generation || !admin.verified) return;
      const styles = new URL(frame.dataset.styles, window.location.href).href;
      const base = window.location.origin + '/';
      const theme = getComputedStyle(document.documentElement);
      const defaults = { background: '#fff', text: '#222', highlight: '#eee' };
      const colors = Object.keys(defaults).map(name => '--primary-' + name + '-color:' + (theme.getPropertyValue('--primary-' + name + '-color').trim() || defaults[name])).join(';');
      // The sandbox has no script or same-origin permission: preview content cannot access the token.
      frame.srcdoc = '<!doctype html><html lang="ko" style="' + escape(colors) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="' + escape(base) + '"><link rel="stylesheet" href="' + escape(styles) + '"></head><body class="preview-body" style="color:var(--primary-text-color,#222);background:var(--primary-background-color,white)"><header class="post-header"><h1 class="post-title">' + escape(title) + '</h1></header><div class="post-content">' + html + '</div></body></html>';
      panel.hidden = false;
      status.textContent = '미리보기를 갱신했습니다.';
    } catch (error) {
      if (current === generation) status.textContent = '미리보기 실패: ' + error.message;
    } finally {
      if (current === generation) button.disabled = !admin.verified;
    }
  });
}());
