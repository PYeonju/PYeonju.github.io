(function () {
  'use strict';
  // Called only by explicit form submission, never by preview or draft saving.
  window.publishPostWithImages = async function ({ path, source, files, branch, expectedSha, message }) {
    const admin = window.BlogAdmin;
    const repo = '/repos/PYeonju/PYeonju.github.io';
    const request = (path, data, method = 'POST') => admin.request(repo + path, data ? { method, body: JSON.stringify(data) } : undefined);
    const refPath = 'heads/' + branch.split('/').map(encodeURIComponent).join('/');
    const head = await request('/git/ref/' + refPath);
    const parent = await request('/git/commits/' + head.object.sha);
    // Check against the same immutable snapshot that becomes our commit parent.
    let existing;
    try { existing = await admin.request(admin.contentsPath(path) + '?ref=' + head.object.sha); }
    catch (error) { if (error.status !== 404) throw error; }
    if (expectedSha ? existing?.sha !== expectedSha : existing) {
      const error = new Error('원본 글이 변경되었거나 같은 제목의 글이 있습니다.');
      error.status = 409;
      throw error;
    }
    const tree = [];
    for (const file of files) {
      const blob = await request('/git/blobs', { content: file.content, encoding: 'base64' });
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const post = await request('/git/blobs', { content: source, encoding: 'utf-8' });
    tree.push({ path, mode: '100644', type: 'blob', sha: post.sha });
    const nextTree = await request('/git/trees', { base_tree: parent.tree.sha, tree });
    const commit = await request('/git/commits', { message, tree: nextTree.sha, parents: [head.object.sha] });
    // Fast-forward only: never overwrite a commit made by someone else meanwhile.
    try { await request('/git/refs/' + refPath, { sha: commit.sha, force: false }, 'PATCH'); }
    catch (error) {
      if (error.status === 422) error.status = 409;
      throw error;
    }
    return { content: { sha: post.sha, html_url: 'https://github.com/PYeonju/PYeonju.github.io/blob/' + commit.sha + '/' + path.split('/').map(encodeURIComponent).join('/') } };
  };
}());
