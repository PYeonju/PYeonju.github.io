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
  const idleLimit = 30 * 60 * 1000;
  let lastActivity = Number(sessionStorage.getItem('blog_last_activity')) || Date.now();
  let idleTimer = null;
  let verificationVersion = 0;
  let expiredNotice = false;

  function expireIfIdle() {
    if (sessionStorage.getItem('blog_token') && Date.now() - lastActivity >= idleLimit) {
      logout();
      expiredNotice = true;
      button.textContent = '관리자 권한 (자동 로그아웃)';
      return true;
    }
    return false;
  }
  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (verified) idleTimer = setTimeout(() => { if (!expireIfIdle()) scheduleIdle(); }, Math.max(1, idleLimit - (Date.now() - lastActivity)));
  }
  function activity(event) {
    if (!verified || !event.isTrusted || expireIfIdle()) return;
    lastActivity = Date.now();
    sessionStorage.setItem('blog_last_activity', String(lastActivity));
    scheduleIdle();
  }
  ['keydown', 'input', 'pointerdown', 'pointermove', 'wheel', 'compositionstart', 'compositionupdate', 'compositionend'].forEach(type => {
    document.addEventListener(type, activity, { capture: true, passive: true });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) expireIfIdle(); });
  window.addEventListener('focus', expireIfIdle);
  window.addEventListener('pageshow', expireIfIdle);

  async function request(path, options = {}) {
    if (expireIfIdle()) throw new Error('30분 동안 활동이 없어 자동 로그아웃되었습니다. 다시 인증해 주세요.');
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
    return response.json();
  }

  function contentsPath(path) {
    return '/repos/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  }

  function setVerified(value) {
    verified = value;
    scheduleIdle();
    document.getElementById('new-post-link').hidden = !value;
    document.querySelectorAll('.delete-post, [data-admin-only]').forEach(item => { item.hidden = !value; });
    button.textContent = value ? '관리자 로그아웃' : '관리자 권한';
    document.dispatchEvent(new CustomEvent('blog-admin-change', { detail: { verified: value } }));
  }

  function logout() {
    verificationVersion++;
    clearTimeout(idleTimer);
    sessionStorage.removeItem('blog_token');
    sessionStorage.removeItem('blog_last_activity');
    tokenField.value = '';
    branch = '';
    setVerified(false);
  }

  async function verify() {
    const version = ++verificationVersion;
    const [user, repository] = await Promise.all([request('/user'), request('/repos/' + repo)]);
    if (version !== verificationVersion || !sessionStorage.getItem('blog_token') || expireIfIdle()) return;
    if (user.login.toLowerCase() !== 'pyeonju' || !repository.permissions?.push) {
      throw new Error('PYeonju 계정의 저장소 쓰기 권한이 필요합니다.');
    }
    expiredNotice = false;
    branch = repository.default_branch;
    setVerified(true);
    dialog.close();
    tokenField.value = '';
    status.textContent = '';
  }

  button.addEventListener('click', () => {
    if (verified) { logout(); return; }
    status.textContent = expiredNotice ? '30분 동안 활동이 없어 자동 로그아웃되었습니다. 작성 내용은 유지됩니다.' : '';
    dialog.showModal();
  });
  document.getElementById('admin-cancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const confirm = document.getElementById('admin-confirm');
    confirm.disabled = true;
    status.textContent = '인증 중...';
    lastActivity = Date.now();
    sessionStorage.setItem('blog_last_activity', String(lastActivity));
    sessionStorage.setItem('blog_token', tokenField.value.trim());
    try { await verify(); }
    catch (error) {
      logout();
      status.textContent = error.message;
    } finally { confirm.disabled = false; }
  });

  window.BlogAdmin = { request, contentsPath, get branch() { return branch; }, get verified() { return verified; }, logout };
  if (sessionStorage.getItem('blog_token')) {
    if (!sessionStorage.getItem('blog_last_activity')) sessionStorage.setItem('blog_last_activity', String(lastActivity));
    if (!expireIfIdle()) verify().catch(logout);
  }
}());
