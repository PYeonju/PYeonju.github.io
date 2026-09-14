(function () {
  'use strict';
  const form = document.getElementById('post-form');
  const status = document.getElementById('post-status');
  const admin = window.BlogAdmin;

  function updateAccess() {
    form.hidden = !admin.verified;
    document.getElementById('editor-locked').hidden = admin.verified;
  }
  document.addEventListener('blog-admin-change', updateAccess);
  updateAccess();

  function yamlString(value) { return JSON.stringify(value); }
  function encodeUtf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function slugify(title) {
    return title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 65) || 'post';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!admin.verified) return;
    const button = document.getElementById('publish-button');
    button.disabled = true;
    status.textContent = 'GitHub에 글을 등록하는 중...';
    const title = document.getElementById('post-title').value.trim();
    const series = document.getElementById('post-series').value.trim();
    const summary = document.getElementById('post-summary').value.trim();
    const body = document.getElementById('post-content').value.trim();
    const date = new Date().toISOString().slice(0, 10);
    const path = '_posts/' + date + '-' + slugify(title) + '.md';
    const contentsPath = admin.contentsPath(path);
    const frontmatter = ['---', 'layout: post', 'title: ' + yamlString(title),
      'date: ' + date, ...(series ? ['series: ' + yamlString(series)] : []),
      ...(summary ? ['summarize: ' + yamlString(summary)] : []), '---', '', body, ''].join('\n');
    try {
      await admin.request(contentsPath + '?ref=' + encodeURIComponent(admin.branch))
        .then(() => { throw new Error('같은 제목의 글이 이미 있습니다. 제목을 바꿔주세요.'); })
        .catch(error => { if (error.status !== 404) throw error; });
      const result = await admin.request(contentsPath, {
        method: 'PUT',
        body: JSON.stringify({ message: 'Add post: ' + title, content: encodeUtf8(frontmatter), branch: admin.branch })
      });
      status.replaceChildren(document.createTextNode('등록 완료! 배포가 끝나면 Blog에 표시됩니다. '));
      const link = document.createElement('a');
      link.href = result.content.html_url;
      link.textContent = 'GitHub에서 글 확인';
      status.append(link);
      form.reset();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}());
