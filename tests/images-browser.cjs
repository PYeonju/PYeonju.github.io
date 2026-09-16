const assert = require('node:assert/strict');
module.exports = async function (browser, base) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('blog_token', 'mock-image-token'));
  const requests = [];
  let conflict = false;
  let postSource = '';
  let tree;
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const payload = req.postDataJSON();
    requests.push({ method: req.method(), path: url.pathname, payload });
    let data, status = 200;
    if (url.pathname === '/user') data = { login: 'PYeonju' };
    else if (url.pathname === '/repos/PYeonju/PYeonju.github.io') data = { default_branch: 'main', permissions: { push: true } };
    else if (url.pathname.includes('/git/ref/')) data = { object: { sha: 'parent' } };
    else if (url.pathname.endsWith('/git/commits/parent')) data = { tree: { sha: 'base-tree' } };
    else if (url.pathname.endsWith('/git/blobs')) {
      if (payload.encoding === 'utf-8') postSource = payload.content;
      data = { sha: payload.encoding === 'utf-8' ? 'post-sha' : 'image-sha' };
    } else if (url.pathname.endsWith('/git/trees')) { tree = payload; data = { sha: 'tree' }; }
    else if (url.pathname.endsWith('/git/commits')) data = { sha: 'new-commit' };
    else if (url.pathname.includes('/git/refs/')) { status = conflict ? 422 : 200; data = conflict ? { message: 'Not fast forward' } : { object: { sha: 'new-commit' } }; }
    else { status = 404; data = { message: 'Not found' }; }
    await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const png = Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4; canvas.getContext('2d').fillRect(0, 0, 4, 4); return canvas.toDataURL('image/png').split(',')[1]; }), 'base64');
  await page.goto(base + '/admin/');
  await page.locator('#post-form').waitFor({ state: 'visible' });
  await page.locator('#post-title').fill('이미지 테스트');
  const before = requests.length;
  await page.locator('#image-files').setInputFiles({ name: 'capture.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('#post-content').value.includes('blog-image/'));
  // Clipboard paste and drag/drop follow the same local-only insertion path.
  for (const kind of ['paste', 'drop']) {
    await page.waitForFunction(() => !BlogImages.busy);
    await page.evaluate(({ bytes, kind }) => {
      const file = new File([new Uint8Array(bytes)], 'capture.png', { type: 'image/png' });
      const transfer = new DataTransfer(); transfer.items.add(file);
      const event = kind === 'paste' ? new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }) : new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
      document.querySelector('#post-content').dispatchEvent(event);
    }, { bytes: [...png], kind });
    await page.waitForFunction(() => !BlogImages.busy);
  }
  const draftBody = await page.inputValue('#post-content');
  assert.equal((draftBody.match(/blog-image\//g) || []).length, 3);
  assert.equal(requests.length, before, 'Inserting images must not contact GitHub');
  await page.reload();
  await page.locator('#draft-recovery').waitFor({ state: 'visible' });
  await page.click('#draft-restore');
  assert.equal(await page.inputValue('#post-content'), draftBody);
  const beforePreview = requests.length;
  const beforeDraft = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  await page.click('#preview-button');
  await page.waitForFunction(() => [...document.querySelectorAll('#preview-content img')].length === 3 && [...document.querySelectorAll('#preview-content img')].every(img => img.complete && img.naturalWidth > 0 && img.src.startsWith('blob:')));
  assert.equal(requests.length, beforePreview);
  assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), beforeDraft);
  // Rejected types must not alter the draft.
  await page.locator('#image-files').setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await page.locator('#image-status').getByText(/추가 실패/).waitFor();
  assert.equal(await page.inputValue('#post-content'), draftBody);
  conflict = true;
  await page.click('#publish-button');
  await page.locator('#post-status').getByText(/충돌/).waitFor();
  assert.equal(await page.inputValue('#post-content'), draftBody);
  assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), beforeDraft);
  conflict = false;
  const retryStart = requests.length;
  await page.click('#publish-button');
  await page.locator('#post-status').getByText(/등록 완료/).waitFor();
  assert.equal(tree.base_tree, 'base-tree');
  assert.equal(tree.tree.length, 4);
  assert.equal(tree.tree.filter(item => item.path.startsWith('assets/images/uploads/')).length, 3);
  assert(!postSource.includes('blog-image/'));
  assert.equal((postSource.match(/\/assets\/images\/uploads\//g) || []).length, 3);
  const retry = requests.slice(retryStart);
  assert.equal(retry.filter(req => req.path.endsWith('/git/commits')).length, 1);
  assert.equal(retry.filter(req => req.method === 'PATCH').length, 1);
  assert.equal(retry.find(req => req.method === 'PATCH').payload.force, false);
  assert.equal(await page.inputValue('#post-content'), '');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Chromium: image picker/paste/drop, IndexedDB recovery, local preview, rejected types, atomic publish and conflict preservation passed.');
};
