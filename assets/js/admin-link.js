(function () {
  'use strict';
  const repo = 'PYeonju/PYeonju.github.io';
  const dialog = document.getElementById('admin-dialog');
  const form = document.getElementById('admin-form');
  const button = document.getElementById('admin-button');
  const status = document.getElementById('admin-status');
  const tokenField = document.getElementById('github-token');
  let verified = false;
  let branch = '';

  async function request(path, options = {}, responseType = 'json') {
    const token = sessionStorage.getItem('blog_token');
    if (!token) throw new Error('관리자 인증이 필요합니다.');
    const response = await fetch('https://api.github.com' + path, {
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
    return responseType === 'text' ? response.text() : response.json();
  }

  function contentsPath(path) {
    return '/repos/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  }

  function setVerified(value) {
    verified = value;
    document.getElementById('new-post-link').hidden = !value;
    document.querySelectorAll('.delete-post, [data-admin-only]').forEach(item => { item.hidden = !value; });
    button.textContent = value ? '관리자 로그아웃' : '관리자 권한';
    document.dispatchEvent(new CustomEvent('blog-admin-change', { detail: { verified: value } }));
  }

  function logout() {
    sessionStorage.removeItem('blog_token');
    branch = '';
    setVerified(false);
  }

  async function verify() {
    const [user, repository] = await Promise.all([request('/user'), request('/repos/' + repo)]);
    if (user.login.toLowerCase() !== 'pyeonju' || !repository.permissions?.push) {
      throw new Error('PYeonju 계정의 저장소 쓰기 권한이 필요합니다.');
    }
    branch = repository.default_branch;
    setVerified(true);
    dialog.close();
    tokenField.value = '';
    status.textContent = '';
  }

  button.addEventListener('click', () => {
    if (verified) { logout(); return; }
    status.textContent = '';
    dialog.showModal();
  });
  document.getElementById('admin-cancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const confirm = document.getElementById('admin-confirm');
    confirm.disabled = true;
    status.textContent = '인증 중...';
    sessionStorage.setItem('blog_token', tokenField.value.trim());
    try { await verify(); }
    catch (error) {
      logout();
      status.textContent = error.message;
    } finally { confirm.disabled = false; }
  });

  window.BlogAdmin = { request, contentsPath, get branch() { return branch; }, get verified() { return verified; }, logout };
  if (sessionStorage.getItem('blog_token')) verify().catch(logout);
}());
