(function () {
  'use strict';
  const button = document.getElementById('preview-button');
  const panel = document.getElementById('post-preview');
  const status = document.getElementById('preview-status');
  const form = document.getElementById('post-form');
  const admin = window.BlogAdmin;
  // Recover an older cached editor without ever rendering into an iframe.
  document.getElementById('preview-frame')?.remove();
  let titleOutput = document.getElementById('preview-title');
  let output = document.getElementById('preview-content');
  if (!titleOutput || !output) {
    const article = document.createElement('article');
    article.className = 'preview-document';
    titleOutput = document.createElement('h1');
    titleOutput.id = 'preview-title';
    titleOutput.className = 'post-title';
    output = document.createElement('div');
    output.id = 'preview-content';
    article.append(titleOutput, output);
    panel.append(article);
  }
  let generation = 0;
  const scriptUrl = new URL(document.currentScript?.src || '/assets/js/preview.js', window.location.href);
  const loading = new Map();
  function library(file, current) {
    if (current()) return Promise.resolve(current());
    if (loading.has(file)) return loading.get(file);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const url = new URL('../vendor/' + file, scriptUrl);
      url.search = scriptUrl.search;
      script.src = url.href;
      let finished = false;
      const finish = error => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        script.remove();
        if (error) { loading.delete(file); reject(error); }
        else resolve(current());
      };
      const timeout = setTimeout(() => finish(new Error('미리보기 파일 로딩 시간 초과')), 10000);
      script.onload = () => finish(current() ? null : new Error('미리보기 변환기 초기화 실패'));
      script.onerror = () => finish(new Error('미리보기 파일 로딩 실패'));
      document.head.append(script);
    });
    loading.set(file, promise);
    return promise;
  }
  function clear() {
    generation++;
    panel.hidden = true;
    titleOutput.textContent = '';
    output.textContent = '';
    status.textContent = '';
    button.disabled = !admin.verified;
  }
  form.addEventListener('reset', clear);
  document.addEventListener('blog-admin-change', clear);
  document.addEventListener('blog-draft-restored', clear);
  clear();
  button.addEventListener('click', async event => {
    event?.preventDefault();
    if (!admin.verified || button.disabled) return;
    const body = document.getElementById('post-content').value;
    const title = document.getElementById('post-title').value;
    const current = ++generation;
    // Show the original text first. Rendering failure must never leave an empty block.
    titleOutput.textContent = title;
    titleOutput.hidden = !title.trim();
    output.className = 'post-content preview-plain';
    output.textContent = body;
    panel.hidden = false;
    if (!body.trim()) { status.textContent = '미리 볼 본문을 입력해 주세요.'; return; }
    button.disabled = true;
    status.textContent = '미리보기를 만드는 중...';
    try {
      const [render, purifier] = await Promise.all([
        library('markdown-it-15.0.2.min.js', () => typeof markdownit === 'function' ? markdownit : null),
        library('dompurify-3.4.15.min.js', () => typeof DOMPurify !== 'undefined' && DOMPurify.isSupported && DOMPurify.sanitize ? DOMPurify : null)
      ]);
      const html = render({ html: false, breaks: true, linkify: true }).render(body);
      const clean = purifier.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 's', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'start', 'align'],
        ALLOW_DATA_ATTR: false
      });
      if (current !== generation || !admin.verified) return;
      if (typeof clean !== 'string' || !clean.trim()) throw new Error('표시할 변환 결과가 없습니다');
      output.innerHTML = clean;
      output.className = 'post-content';
      await window.BlogImages?.preview(output);
      if (current !== generation || !admin.verified) return;
      status.textContent = '미리보기를 갱신했습니다. GitHub에는 저장하지 않았습니다.';
    } catch (error) {
      if (current === generation) status.textContent = 'Markdown 변환을 완료하지 못해 원문을 표시합니다. ' + error.message;
    } finally {
      if (current === generation) button.disabled = !admin.verified;
    }
  });
}());
