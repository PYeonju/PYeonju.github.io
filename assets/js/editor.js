(function () {
  'use strict';
  const repo = 'PYeonju/PYeonju.github.io';
  const api = 'https://api.github.com';
  const loginPanel = document.getElementById('login-panel');
  const form = document.getElementById('post-form');
  const status = document.getElementById('post-status');
  const tokenField = document.getElementById('github-token');
  let token = sessionStorage.getItem('blog_token') || '';
  let branch = '';

  async function request(path, options = {}) {
    const response = await fetch(api + path, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers
      }
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const error = new Error(details.message || 'GitHub 요청 실패 (' + response.status + ')');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function verify() {
    const [user, repository] = await Promise.all([
      request('/user'), request('/repos/' + repo)
    ]);
    if (user.login.toLowerCase() !== 'pyeonju' || !repository.permissions || !repository.permissions.push) {
      throw new Error('이 저장소의 관리자 계정과 쓰기 권한이 필요합니다.');
    }
    branch = repository.default_branch;
    sessionStorage.setItem('blog_token', token);
    sessionStorage.setItem('blog_admin', 'verified');
    loginPanel.hidden = true;
    form.hidden = false;
    document.getElementById('admin-user').textContent = user.login + ' 계정으로 연결됨';
    document.getElementById('new-post-link').hidden = false;
    status.textContent = '';
  }

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

  document.getElementById('login-button').addEventListener('click', async () => {
    token = tokenField.value.trim();
    if (!token) return;
    status.textContent = '권한 확인 중...';
    try { await verify(); tokenField.value = ''; }
    catch (error) { token = ''; status.textContent = error.message; }
  });

  document.getElementById('logout-button').addEventListener('click', () => {
    sessionStorage.removeItem('blog_token');
    sessionStorage.removeItem('blog_admin');
    token = '';
    form.hidden = true;
    loginPanel.hidden = false;
    document.getElementById('new-post-link').hidden = true;
    status.textContent = '로그아웃했습니다.';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('publish-button');
    button.disabled = true;
    status.textContent = 'GitHub에 글을 등록하는 중...';
    const title = document.getElementById('post-title').value.trim();
    const series = document.getElementById('post-series').value.trim();
    const summary = document.getElementById('post-summary').value.trim();
    const body = document.getElementById('post-content').value.trim();
    const date = new Date().toISOString().slice(0, 10);
    const filename = date + '-' + slugify(title) + '.md';
    const path = '_posts/' + filename;
    const contentsPath = '/repos/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
    const frontmatter = ['---', 'layout: post', 'title: ' + yamlString(title),
      'date: ' + date, ...(series ? ['series: ' + yamlString(series)] : []),
      ...(summary ? ['summarize: ' + yamlString(summary)] : []), '---', '', body, ''].join('\n');
    try {
      await request(contentsPath + '?ref=' + encodeURIComponent(branch))
        .then(() => { throw new Error('같은 제목의 글이 이미 있습니다. 제목을 바꿔주세요.'); })
        .catch(error => { if (error.status !== 404) throw error; });
      const result = await request(contentsPath, {
        method: 'PUT',
        body: JSON.stringify({ message: 'Add post: ' + title, content: encodeUtf8(frontmatter), branch })
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

  if (token) verify().catch(error => {
    sessionStorage.removeItem('blog_token');
    sessionStorage.removeItem('blog_admin');
    token = '';
    status.textContent = error.message;
  });
}());
