(function () {
  'use strict';
  const form = document.getElementById('post-form');
  const status = document.getElementById('post-status');
  const button = document.getElementById('publish-button');
  const heading = document.getElementById('editor-heading');
  const dateLabel = document.getElementById('original-post-date');
  const admin = window.BlogAdmin;
  const editPath = new URLSearchParams(window.location.search).get('edit');
  const validEditPath = !editPath || /^_posts\/[^/\\]+\.(md|markdown)$/.test(editPath);
  let original = null;
  let loading = false;
  let saving = false;

  if (editPath) {
    heading.textContent = '글 수정';
    button.textContent = '수정 저장';
  }

  function encodeUtf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function decodeUtf8(value) {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(value.replace(/\s/g, '')), character => character.charCodeAt(0))
    );
  }
  function parsePost(source) {
    const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) throw new Error('글의 YAML 머리말을 읽을 수 없습니다. 원본 파일을 확인해 주세요.');
    const metadata = jsyaml.load(match[1], { schema: jsyaml.CORE_SCHEMA });
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('글의 YAML 머리말 형식이 올바르지 않습니다.');
    }
    return { metadata, body: match[2].replace(/^\r?\n/, '') };
  }
  function slugify(title) {
    return title.toLowerCase().normalize('NFC')
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 65) || 'post';
  }
  function refreshButton() {
    button.disabled = !admin.verified || loading || saving || !validEditPath || (!!editPath && !original);
  }

  async function loadOriginal() {
    if (!admin.verified || !editPath || !validEditPath || original || loading) return;
    loading = true;
    refreshButton();
    status.textContent = '기존 글을 불러오는 중...';
    try {
      const branch = admin.branch;
      const file = await admin.request(admin.contentsPath(editPath) + '?ref=' + encodeURIComponent(branch));
      if (!admin.verified) return;
      if (!file.sha || file.encoding !== 'base64' || typeof file.content !== 'string') {
        throw new Error('글 원문을 불러오지 못했습니다.');
      }
      const parsed = parsePost(decodeUtf8(file.content));
      original = { ...parsed, sha: file.sha, branch };
      document.getElementById('post-title').value = String(parsed.metadata.title ?? '');
      document.getElementById('post-series').value = String(parsed.metadata.series ?? '');
      document.getElementById('post-summary').value = String(parsed.metadata.summarize ?? '');
      document.getElementById('post-content').value = parsed.body;
      dateLabel.textContent = '최초 작성일: ' + String(parsed.metadata.date ?? editPath.slice(7, 17)) + ' (수정해도 유지됩니다)';
      dateLabel.hidden = false;
      status.textContent = '';
    } catch (error) {
      status.textContent = '불러오기 실패: ' + error.message + ' 새로고침 후 다시 시도해 주세요.';
    } finally {
      loading = false;
      refreshButton();
    }
  }

  function updateAccess() {
    form.hidden = !admin.verified;
    document.getElementById('editor-locked').hidden = admin.verified;
    if (!validEditPath) status.textContent = '올바른 글 수정 주소가 아닙니다.';
    refreshButton();
    void loadOriginal();
  }
  document.addEventListener('blog-admin-change', updateAccess);
  updateAccess();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || saving || !admin.verified || (editPath && !original)) return;
    const title = document.getElementById('post-title').value.trim();
    const series = document.getElementById('post-series').value.trim();
    const summary = document.getElementById('post-summary').value.trim();
    const body = document.getElementById('post-content').value;
    if (!title || !body.trim()) {
      status.textContent = '제목과 본문을 입력해 주세요.';
      return;
    }
    saving = true;
    refreshButton();
    status.textContent = editPath ? '수정 내용을 저장하는 중...' : 'GitHub에 글을 등록하는 중...';
    try {
      const date = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' +0900';
      const path = editPath || '_posts/' + date.slice(0, 10) + '-' + slugify(title) + '.md';
      const contentsPath = admin.contentsPath(path);
      const metadata = editPath ? { ...original.metadata } : { layout: 'post', date };
      metadata.title = title;
      if (series) metadata.series = series; else delete metadata.series;
      if (summary) metadata.summarize = summary; else delete metadata.summarize;
      // Editing preserves date, permalink, slug, and all other existing metadata.
      const source = '---\n' + jsyaml.dump(metadata, { schema: jsyaml.YAML11_SCHEMA }) + '---\n\n' + body;
      if (!editPath) {
        await admin.request(contentsPath + '?ref=' + encodeURIComponent(admin.branch))
          .then(() => { throw new Error('같은 제목의 글이 이미 있습니다. 제목을 바꿔주세요.'); })
          .catch(error => { if (error.status !== 404) throw error; });
      }
      const result = await admin.request(contentsPath, {
        method: 'PUT',
        body: JSON.stringify({
          message: (editPath ? 'Update post: ' : 'Add post: ') + title,
          content: encodeUtf8(source),
          branch: editPath ? original.branch : admin.branch,
          ...(editPath ? { sha: original.sha } : {})
        })
      });
      if (editPath) original = { ...original, metadata, body, sha: result.content.sha };
      status.replaceChildren(document.createTextNode((editPath ? '수정 완료!' : '등록 완료!') + ' 배포가 끝나면 블로그에 반영됩니다. '));
      const link = document.createElement('a');
      link.href = result.content.html_url;
      link.textContent = 'GitHub에서 글 확인';
      status.append(link);
      if (!editPath) form.reset();
    } catch (error) {
      status.textContent = error.status === 409
        ? '다른 수정 내용과 충돌했습니다. 입력 내용을 복사한 뒤 새로고침하여 최신 글을 확인해 주세요.'
        : error.message;
    } finally {
      saving = false;
      refreshButton();
    }
  });
}());
