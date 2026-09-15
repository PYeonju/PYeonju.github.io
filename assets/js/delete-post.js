(function () {
  'use strict';
  const admin = window.BlogAdmin;
  const dialog = document.getElementById('delete-dialog');
  const status = document.getElementById('delete-status');
  const confirm = document.getElementById('delete-confirm');
  let selected = null;

  document.addEventListener('click', event => {
    const button = event.target.closest('.delete-post');
    if (!button || !admin.verified) return;
    selected = button;
    document.getElementById('delete-post-title').textContent = button.dataset.title;
    status.textContent = '';
    dialog.showModal();
  });
  document.getElementById('delete-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { selected = null; });

  confirm.addEventListener('click', async () => {
    if (!selected || !admin.verified) return;
    confirm.disabled = true;
    status.textContent = '삭제하는 중...';
    const button = selected;
    try {
      const path = admin.contentsPath(button.dataset.path);
      const file = await admin.request(path + '?ref=' + encodeURIComponent(admin.branch));
      await admin.request(path, {
        method: 'DELETE',
        body: JSON.stringify({ message: 'Delete post: ' + button.dataset.title, sha: file.sha, branch: admin.branch })
      });
      document.dispatchEvent(new CustomEvent('blog-post-deleted', { detail: { button } }));
      const row = button.closest('li');
      if (row) row.remove();
      dialog.close();
      if (button.dataset.afterDelete) window.location.assign(button.dataset.afterDelete);
    } catch (error) { status.textContent = '삭제 실패: ' + error.message; }
    finally { confirm.disabled = false; }
  });
}());
