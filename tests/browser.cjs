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
      res.end(fs.readFileSync(target));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const base = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => sessionStorage.setItem('blog_token', 'test-only-mocked-token'));
    let writes = 0;
    await page.route('https://api.github.com/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
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
    const text = '그냥 Text 입니다.\n다음 줄입니다.\n\n<Text>\nvector<int> & 비교';
    await page.locator('#post-content').fill(text);
    for (const theme of ['default', 'dark']) {
      await page.selectOption('#themeSelector', theme);
      await page.click('#preview-button');
      const content = page.frameLocator('#preview-frame').locator('.post-content');
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
    await page.goto(base + '/blog/');
    const hint = await page.locator('.blog-toolbar > p').boundingBox();
    const control = await page.locator('.page-size-control').boundingBox();
    const toolbar = await page.locator('.blog-toolbar').boundingBox();
    assert(Math.abs(hint.y + hint.height / 2 - control.y - control.height / 2) < 3);
    assert(Math.abs(control.x + control.width - toolbar.x - toolbar.width) < 3);
    await page.setViewportSize({ width: 375, height: 800 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout must not overflow');
    assert.deepEqual(errors, []);
    console.log('Chromium: plain text in both themes, local draft recovery and cleanup, responsive toolbar passed.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
