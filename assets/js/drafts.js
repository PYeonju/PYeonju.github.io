(function () {
  'use strict';
  const admin = window.BlogAdmin;
  const ids = ['post-title', 'post-series', 'post-summary', 'post-content'];
  const fields = ids.map(id => document.getElementById(id));
  const status = document.getElementById('draft-status');
  const recovery = document.getElementById('draft-recovery');
  const message = document.getElementById('draft-recovery-message');
  const saveButton = document.getElementById('draft-save');
  let context = null;
  let pending = null;
  let baseline = '';
  const values = () => fields.map(field => field.value);
  const stamp = time => new Date(time).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  const key = () => 'blog-draft:v1:PYeonju/PYeonju.github.io:' + context.branch + ':' + context.path;

  function remove() {
    localStorage.removeItem(key());
    pending = null;
    recovery.hidden = true;
  }
  function save(manual = false) {
    if (!admin.verified || !context) return;
    if (pending) {
      if (!manual) return;
      if (!window.confirm('보관된 임시저장을 현재 입력 내용으로 덮어쓸까요?')) return;
    }
    const content = values();
    if (!manual && JSON.stringify(content) === baseline) return;
    try {
      if (content.every(value => !value.trim())) {
        remove();
        status.textContent = '빈 임시저장을 삭제했습니다.';
      } else {
        const savedAt = Date.now();
        localStorage.setItem(key(), JSON.stringify({ version: 1, values: content, sha: context.sha, savedAt }));
        pending = null;
        recovery.hidden = true;
        status.textContent = '임시저장 완료 · ' + stamp(savedAt) + ' (이 브라우저)';
      }
      baseline = JSON.stringify(content);
    } catch (error) {
      status.textContent = '브라우저에 임시저장하지 못했습니다. 저장 공간·브라우저 설정을 확인하고 내용을 복사해 보관해 주세요.';
    }
  }

  window.BlogDrafts = {
    activate(next) {
      if (!admin.verified) return;
      if (context && context.path === next.path && context.branch === next.branch) {
        saveButton.disabled = false;
        return;
      }
      context = next;
      baseline = JSON.stringify(values());
      saveButton.disabled = false;
      try {
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
          (next.path !== 'new' && draft.sha !== next.sha ? ' 이후 원본 글이 변경되었습니다. 복원 후 최신 내용과 비교해 주세요.' : '') +
          ' 복원하거나 삭제한 뒤 작성해 주세요.';
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
  fields.forEach(field => field.addEventListener('input', () => save()));
  saveButton.addEventListener('click', () => save(true));
  document.getElementById('draft-restore').addEventListener('click', () => {
    if (!admin.verified || !pending) return;
    fields.forEach((field, index) => { field.value = pending.values[index]; });
    pending = null;
    recovery.hidden = true;
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
  document.addEventListener('blog-admin-change', () => { saveButton.disabled = !admin.verified || !context; });
}());
