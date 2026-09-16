const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve('_site');
  const server = http.createServer((req, res) => {
    const filename = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const target = filename.endsWith('/') ? filename + 'index.html' : filename;
    try {
      const ext = path.extname(target);
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' })[ext] || 'application/octet-stream');
      let content = fs.readFileSync(target);
      if (ext === '.html' && req.url.includes('legacy=1')) {
        content = content.toString().replace(/<script[^>]+src="[^"]*(?:markdown-it|dompurify)[^"]*"[^>]*><\/script>/g, '');
      }
      if (ext === '.html' && req.url.includes('legacy=1')) {
        content = content.toString().replace(/<article class="preview-document">[\s\S]*?<\/article>/, '<iframe id="preview-frame" sandbox=""></iframe>');
      }
      res.end(content);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.clock.install({ time: new Date('2026-09-16T00:00:00Z') });
    const base = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { if (window === window.top) sessionStorage.setItem('blog_token', 'test-only-mocked-token'); });
    let writes = 0;
    const apiRequests = [];
    await page.route('https://api.github.com/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      apiRequests.push(request.method() + ' ' + url.pathname);
      let data, status = 200;
      if (url.pathname === '/user') data = { login: 'PYeonju' };
      else if (url.pathname === '/repos/PYeonju/PYeonju.github.io') data = { default_branch: 'main', permissions: { push: true } };
      else if (request.method() === 'PUT') { writes++; data = { content: { sha: 'saved', html_url: 'https://github.com/example/post' } }; }
      else { status = 404; data = { message: 'Not found' }; }
      await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(base + '/admin/');
    await page.locator('#post-form').waitFor({ state: 'visible' });
    await page.locator('#post-title').fill('일반 텍스트 확인');
    await page.locator('#post-series').fill('C++');
    await page.locator('#post-summary').fill('소개');
    const previewFrame = page.locator('#post-preview');
    for (const body of ['# 안녕하세요', '그리고 그냥\n\n이런식으로 작성하는 텍스트', '# 다시 안녕하세요\n\n일반 문장입니다.']) {
      await page.locator('#post-content').fill(body);
      const savedBefore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      const requestsBefore = apiRequests.length;
      await page.click('#preview-button');
      const expected = body.split('\n').filter(Boolean).at(-1).replace(/^# /, '');
      await previewFrame.locator('.post-content').getByText(expected, { exact: false }).waitFor({ state: 'visible' });
      assert.equal(apiRequests.length, requestsBefore, 'Preview must make zero GitHub API requests');
      assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), savedBefore, 'Preview must not save even a local draft');
      assert.equal(await page.locator('#post-preview iframe').count(), 0);
      if (body.startsWith('# ')) assert.equal(await previewFrame.locator('.post-content h1').innerText(), body.split('\n')[0].slice(2));
    }
    const editorBox = await page.locator('.editor-pane').boundingBox();
    const previewBox = await page.locator('#post-preview').boundingBox();
    assert(previewBox.x >= editorBox.x + editorBox.width, 'Desktop preview must sit to the right of the editor');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileEditor = await page.locator('.editor-pane').boundingBox();
    const mobilePreview = await page.locator('#post-preview').boundingBox();
    assert(mobilePreview.y >= mobileEditor.y + mobileEditor.height, 'Mobile preview must follow the editor');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile editor must not overflow horizontally');
    await page.setViewportSize({ width: 1280, height: 900 });
    // A failed renderer must leave visible, literal original text instead of an empty block.
    await page.evaluate(() => { window.savedRenderer = window.markdownit; window.markdownit = () => { throw new Error('forced render failure'); }; });
    await page.locator('#post-content').fill('원문 <Text>\n두 번째 줄');
    const requestsBeforeFailure = apiRequests.length;
    await page.click('#preview-button');
    await page.locator('#preview-status').getByText(/원문을 표시합니다/).waitFor();
    assert.equal(await page.locator('#preview-content').innerText(), '원문 <Text>\n두 번째 줄');
    assert.equal(apiRequests.length, requestsBeforeFailure);
    // Exercise the real sanitizer against unsafe output, independent of Markdown's own escaping.
    await page.evaluate(() => {
      window.markdownit = () => ({ render: () => '<p>안전한 문장</p><img src="x" onerror="window.previewExecuted=true"><script>window.previewExecuted=true<\/script><form><input name="post-content"></form><style>body{display:none}</style>' });
    });
    await page.click('#preview-button');
    await page.locator('#preview-content p').getByText('안전한 문장').waitFor();
    assert.equal(await page.locator('#preview-content script, #preview-content [onerror], #preview-content form, #preview-content style').count(), 0);
    assert.equal(await page.evaluate(() => window.previewExecuted), undefined);
    await page.evaluate(() => { window.markdownit = window.savedRenderer; });
    const text = '그냥 Text 입니다.\n다음 줄입니다.\n\n<Text>\nvector<int> & 비교';
    await page.locator('#post-content').fill(text);
    for (const theme of ['default', 'dark']) {
      await page.selectOption('#themeSelector', theme);
      await page.click('#preview-button');
      const content = page.locator('#post-preview').locator('.post-content');
      await content.waitFor({ state: 'visible' });
      assert.match(await content.innerText(), /그냥 Text 입니다\./);
      assert.match(await content.innerText(), /<Text>/);
      assert.match(await content.innerText(), /vector<int> & 비교/);
      const colors = await content.evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(document.body).backgroundColor }));
      assert.notEqual(colors.foreground, colors.background);
      const box = await content.boundingBox();
      assert(box.width > 100 && box.height > 30, 'Plain text must occupy visible space');
    }
    assert.equal(writes, 0, 'Preview and drafts must not publish');
    await page.reload();
    await page.locator('#draft-recovery').waitFor({ state: 'visible' });
    assert.equal(await page.inputValue('#post-content'), '');
    await page.click('#draft-restore');
    assert.equal(await page.inputValue('#post-content'), text);
    assert.equal(await page.inputValue('#post-series'), 'C++');
    assert.equal(await page.inputValue('#post-summary'), '소개');
    await page.click('#publish-button');
    await page.waitForFunction(() => document.querySelector('#post-status').textContent.includes('등록 완료'));
    assert.equal(writes, 1);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('blog-draft:')).length), 0);
    // Simulate cached editor HTML without the Markdown renderer tag.
    await page.route('**/assets/vendor/markdown-it*', route => route.abort());
    await page.goto(base + '/admin/?legacy=1');
    await page.locator('#post-form').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => typeof markdownit), 'undefined');
    await page.locator('#post-content').fill('# 안녕하세요\n\n그리고 그냥\n\n이런식으로 작성하는 텍스트');
    const requestsBeforeLegacy = apiRequests.length;
    await page.click('#preview-button');
    await page.locator('#preview-status').getByText(/원문을 표시합니다/).waitFor();
    assert.match(await page.locator('#preview-content').innerText(), /# 안녕하세요/);
    await page.unroute('**/assets/vendor/markdown-it*');
    await page.click('#preview-button');
    await page.locator('#post-preview').locator('.post-content h1').getByText('안녕하세요', { exact: true }).waitFor({ state: 'visible' });
    assert.match(await page.locator('#post-preview').locator('.post-content').innerText(), /이런식으로 작성하는 텍스트/);
    assert.equal(apiRequests.length, requestsBeforeLegacy);
    assert.equal(await page.locator('#post-preview iframe').count(), 0);
    await page.goto(base + '/blog/');
    const hint = await page.locator('.blog-toolbar > p').boundingBox();
    const control = await page.locator('.page-size-control').boundingBox();
    const toolbar = await page.locator('.blog-toolbar').boundingBox();
    assert(Math.abs(hint.y + hint.height / 2 - control.y - control.height / 2) < 3);
    assert(Math.abs(control.x + control.width - toolbar.x - toolbar.width) < 3);
    await page.setViewportSize({ width: 375, height: 800 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout must not overflow');
    // New drafts have separate slots, capped at three, and are recoverable from the list.
    await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('blog-draft:')).forEach(key => localStorage.removeItem(key)));
    await page.goto(base + '/admin/?draft=capacity-a');
    for (const title of ['A', 'B', 'C', 'D']) {
      await page.locator('#post-form').waitFor({ state: 'visible' });
      await page.locator('#post-title').fill(title);
      await page.locator('#post-content').fill(title + ' body');
      await page.click('#draft-save');
      await page.clock.fastForward(1000);
      if (title !== 'D') {
        const before = page.url();
        await page.click('#draft-new');
        await page.waitForURL(url => url.href !== before);
      }
    }
    const draftTitles = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('blog-draft:')).map(key => JSON.parse(localStorage.getItem(key)).values[0]).sort());
    assert.deepEqual(await draftTitles(), ['B','C','D']);
    await page.click('#draft-save');
    assert.deepEqual(await draftTitles(), ['B','C','D']);
    await page.locator('#draft-list a').getByText(/^B ·/).click();
    await page.locator('#draft-recovery').waitFor({ state: 'visible' });
    await page.click('#draft-restore');
    assert.equal(await page.inputValue('#post-content'), 'B body');
    await page.click('#draft-new');
    await page.locator('#post-form').waitFor({ state: 'visible' });
    await page.locator('#post-title').fill('E');
    await page.locator('#post-content').fill('E body');
    assert.deepEqual(await draftTitles(), ['B','D','E']);
    assert.equal(writes, 1, 'Drafts must not publish');
    // More than an hour of active use must stay signed in; 30 truly idle minutes must expire.
    await page.clock.fastForward(29 * 60000);
    assert.equal(await page.evaluate(() => BlogAdmin.verified), true);
    await page.locator('#post-content').focus();
    await page.keyboard.type(' active typing');
    await page.clock.fastForward(29 * 60000);
    assert.equal(await page.evaluate(() => BlogAdmin.verified), true);
    await page.click('#draft-save');
    await page.clock.fastForward(29 * 60000);
    assert.equal(await page.evaluate(() => BlogAdmin.verified), true);
    await page.keyboard.press('Tab');
    const storedBeforeIdle = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    const bodyBeforeIdle = await page.inputValue('#post-content');
    await page.clock.fastForward(30 * 60000 + 1);
    assert.equal(await page.evaluate(() => BlogAdmin.verified), false);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('blog_token')), null);
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), storedBeforeIdle);
    assert.equal(await page.inputValue('#post-content'), bodyBeforeIdle);
    await page.click('#admin-button');
    await page.locator('#github-token').fill('test-only-mocked-token');
    await page.click('#admin-confirm');
    await page.locator('#post-form').waitFor({ state: 'visible' });
    assert.equal(await page.inputValue('#post-content'), bodyBeforeIdle);
    assert.deepEqual(errors, []);
    await require('./images-browser.cjs')(browser, base);
    await require('./profile-browser.cjs')(browser, base);
    console.log('Chromium: inline Markdown/plain text, fallback and retry, sanitization, zero preview saves/API calls, draft recovery and toolbar passed.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
