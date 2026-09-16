(function () {
  'use strict';
  const admin = window.BlogAdmin;
  const ids = ['post-title', 'post-series', 'post-summary', 'post-content'];
  const fields = ids.map(id => document.getElementById(id));
  const status = document.getElementById('draft-status');
  const recovery = document.getElementById('draft-recovery');
  const message = document.getElementById('draft-recovery-message');
  const saveButton = document.getElementById('draft-save');
  const newButton = document.getElementById('draft-new');
  const list = document.getElementById('draft-list');
  const prefix = 'blog-draft:v1:PYeonju/PYeonju.github.io:';
  const selectedId = new URLSearchParams(window.location.search).get('draft');
  const newPath = selectedId && /^[a-zA-Z0-9-]{1,64}$/.test(selectedId) ? 'new:' + selectedId : 'new';
  const isNew = path => path === 'new' || path.startsWith('new:');
  let context = null;
  let pending = null;
  let baseline = '';
  const values = () => fields.map(field => field.value);
  function updateState() {
    saveButton.disabled = !admin.verified || !context || !!pending;
    if (newButton) newButton.disabled = !admin.verified || !context;
    document.dispatchEvent(new CustomEvent('blog-draft-state'));
  }
  const stamp = time => new Date(time).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  const key = () => prefix + context.branch + ':' + context.path;
  function records() {
    const result = [];
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index);
      if (!name?.startsWith(prefix)) continue;
      try {
        const data = JSON.parse(localStorage.getItem(name));
        result.push({ key: name, data, time: Number(data.savedAt) || 0 });
      } catch { result.push({ key: name, data: null, time: 0 }); }
    }
    return result.sort((a, b) => a.time - b.time || a.key.localeCompare(b.key));
  }
  function trim() {
    const all = records();
    // Keep the just-saved draft even if timestamps are equal.
    const oldest = all.filter(item => item.key !== key());
    let removed = 0;
    while (all.length - removed > 3) {
      localStorage.removeItem(oldest[removed].key);
      removed++;
    }
    return removed;
  }
  function renderList() {
    if (!list || !context || !admin.verified) return;
    list.replaceChildren();
    for (const item of records().reverse()) {
      if (!item.data?.values || !item.key.startsWith(prefix + context.branch + ':')) continue;
      const path = item.key.slice((prefix + context.branch + ':').length);
      const row = document.createElement('li');
      const link = document.createElement('a');
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      if (isNew(path)) {
        if (path !== 'new') url.searchParams.set('draft', path.slice(4));
      } else url.searchParams.set('edit', path);
      link.href = url.href;
      link.textContent = (item.data.values[0] || '제목 없는 글') + ' · ' + stamp(item.time) + (item.key === key() ? ' (현재 초안)' : '');
      row.append(link);
      list.append(row);
    }
  }

  function remove() {
    localStorage.removeItem(key());
    pending = null;
    recovery.hidden = true;
    updateState();
    renderList();
  }
  function save(manual = false) {
    if (!admin.verified || !context) return false;
    if (pending) {
      if (!manual) return;
      if (!window.confirm('보관된 임시저장을 현재 입력 내용으로 덮어쓸까요?')) return;
    }
    const content = values();
    if (!manual && JSON.stringify(content) === baseline) return true;
    try {
      if (content.every(value => !value.trim())) {
        remove();
        status.textContent = '빈 임시저장을 삭제했습니다.';
      } else {
        const savedAt = Date.now();
        localStorage.setItem(key(), JSON.stringify({ version: 1, values: content, sha: context.sha, savedAt }));
        const removed = trim();
        pending = null;
        recovery.hidden = true;
        renderList();
        status.textContent = '임시저장 완료 · ' + stamp(savedAt) + ' (이 브라우저)' + (removed ? ' · 가장 오래된 임시저장을 삭제했습니다.' : '');
      }
      baseline = JSON.stringify(content);
      return true;
    } catch (error) {
      status.textContent = '브라우저에 임시저장하지 못했습니다. 저장 공간·브라우저 설정을 확인하고 내용을 복사해 보관해 주세요.';
      return false;
    }
  }

  window.BlogDrafts = {
    get hasPending() { return !!pending; },
    activate(next) {
      if (!admin.verified) return;
      next = { ...next, path: next.path === 'new' ? newPath : next.path };
      if (context && context.path === next.path && context.branch === next.branch) {
        updateState();
        return;
      }
      context = next;
      pending = null;
      recovery.hidden = true;
      baseline = JSON.stringify(values());
      updateState();
      try {
        renderList();
        const raw = localStorage.getItem(key());
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (draft.version !== 1 || !Array.isArray(draft.values) || draft.values.length !== ids.length ||
            !draft.values.every(value => typeof value === 'string') || !Number.isFinite(draft.savedAt)) {
          throw new Error('Invalid draft');
        }
        pending = draft;
        recovery.hidden = false;
        message.textContent = stamp(draft.savedAt) + '에 보관한 임시저장이 있습니다.' +
          (!isNew(next.path) && draft.sha !== next.sha ? ' 이후 원본 글이 변경되었습니다. 복원 후 최신 내용과 비교해 주세요.' : '') +
          ' 복원하거나 삭제한 뒤 작성해 주세요.';
        updateState();
      } catch (error) {
        status.textContent = '임시저장을 읽지 못했습니다. 현재 입력 내용은 유지됩니다.';
      }
    },
    published(sha) {
      if (!context) return;
      try {
        remove();
        context.sha = sha || '';
        baseline = JSON.stringify(values());
        status.textContent = '게시한 내용의 임시저장을 정리했습니다.';
      } catch (error) {
        status.textContent = '게시에는 성공했지만 임시저장 삭제에 실패했습니다.';
      }
    }
  };
  newButton?.addEventListener('click', () => {
    if (!admin.verified || !context) return;
    if (!pending && !save()) return;
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('draft', window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    window.location.assign(url.href);
  });
  window.addEventListener('storage', () => { try { renderList(); } catch {} });
  fields.forEach(field => field.addEventListener('input', () => save()));
  saveButton.addEventListener('click', () => save(true));
  document.getElementById('draft-restore').addEventListener('click', () => {
    if (!admin.verified || !pending) return;
    fields.forEach((field, index) => { field.value = pending.values[index]; });
    pending = null;
    recovery.hidden = true;
    updateState();
    save(true);
    document.dispatchEvent(new CustomEvent('blog-draft-restored'));
  });
  document.getElementById('draft-discard').addEventListener('click', () => {
    if (!admin.verified || !context) return;
    try {
      remove();
      baseline = JSON.stringify(values());
      status.textContent = '보관된 임시저장을 삭제했습니다.';
    } catch (error) { status.textContent = '임시저장을 삭제하지 못했습니다.'; }
  });
  document.addEventListener('blog-admin-change', updateState);
}());
